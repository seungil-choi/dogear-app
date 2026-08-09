-- 공공데이터(LOCALDATA 계열) 적재 파이프라인
--
-- 왜 DB에서 하나:
--   ①좌표계 변환 ②중복 판정 ③행정구역 파싱이 전부 PostGIS/SQL이 잘하는 일이다.
--      앱·스크립트에서 하면 proj4 의존이 붙고, 변환 결과를 검증할 방법도 없다.
--   ②원본 CSV는 EPSG:5174(Bessel 중부원점 TM)로 좌표를 준다. 그대로 넣으면
--      지도에 안 찍힌다. st_transform으로 WGS84(4326)로 바꾼다.
--
-- 흐름: 스크립트가 CSV를 파싱해 localdata_staging에 적재
--       → import_localdata_batch()가 변환·검증·업서트
--       → 배치 삭제
--
-- 재실행 안전: spots(external_source, external_id) 부분 유니크 인덱스로 업서트한다.
--   같은 파일을 두 번 돌려도 행이 늘지 않고 이름·주소·좌표만 갱신된다.

create table if not exists public.localdata_staging (
  batch_id            uuid   not null,
  row_no              int    not null,
  category            public.spot_category not null,
  external_id         text,             -- 관리번호
  biz_name            text,
  status_name         text,             -- 영업상태명 ('영업/정상', '폐업' 등)
  detail_status_name  text,             -- 상세영업상태명
  road_addr           text,
  lot_addr            text,
  phone               text,
  coord_x             double precision, -- EPSG:5174
  coord_y             double precision,
  primary key (batch_id, row_no)
);

alter table public.localdata_staging enable row level security;
-- 정책을 하나도 두지 않는다 = 아무도 못 읽는다.
-- service_role만 RLS를 우회하므로 적재 스크립트 외에는 접근 경로가 없다.

comment on table public.localdata_staging is
  '공공데이터 CSV 원본 임시 적재소. import_localdata_batch로 옮긴 뒤 배치를 지운다.';

-- ─────────────────────────────────────────────────────────────
create or replace function public.import_localdata_batch(
  p_batch_id uuid,
  p_source   text,               -- spots.external_source에 기록 (예: 'localdata_vet')
  p_dry_run  boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total    int;
  v_no_coord int;
  v_closed   int;
  v_oob      int;
  v_dup_name int;
  v_masked   int;
  v_ready    int;
  v_written  int := 0;
begin
  if p_source is null or btrim(p_source) = '' then
    raise exception 'p_source는 필수입니다 (spots.external_source에 기록됩니다)'
      using errcode = '22023';
  end if;

  -- on commit drop은 커밋 때까지 안 지워진다. 같은 트랜잭션에서 두 번 부르면
  -- (드라이런 → 실행이 정확히 그 경우다) 42P07로 죽는다. 먼저 치운다.
  drop table if exists _batch;
  drop table if exists _valid;
  drop table if exists _dup;

  create temp table _batch on commit drop as
  select
    s.row_no,
    s.category,
    nullif(btrim(s.external_id), '')            as external_id,
    nullif(btrim(s.biz_name), '')               as name,
    -- 마스킹된 주소는 별표 앞에서 자른다 (clean_masked_address 참고)
    public.clean_masked_address(s.road_addr)    as address_road,
    public.clean_masked_address(s.lot_addr)     as address_lot,
    coalesce(public.clean_masked_address(s.road_addr),
             public.clean_masked_address(s.lot_addr)) as address_text,
    (s.road_addr like '%*%' or s.lot_addr like '%*%') as was_masked,
    nullif(btrim(s.phone), '')                  as phone,
    -- 영업 중만 남긴다. 폐업한 병원이 뜨는 순간 신뢰가 깨진다.
    (coalesce(s.status_name, '') like '영업%')  as is_open,
    case
      when s.coord_x is null or s.coord_y is null then null
      else st_transform(st_setsrid(st_makepoint(s.coord_x, s.coord_y), 5174), 4326)
    end as geom
  from public.localdata_staging s
  where s.batch_id = p_batch_id;

  select count(*) into v_total from _batch;
  if v_total = 0 then
    return jsonb_build_object('error', '배치가 비어 있습니다', 'batch_id', p_batch_id);
  end if;

  -- 유효성 판정 — 왜 버렸는지 단계별로 센다. 조용히 줄어드는 게 제일 나쁘다.
  select count(*) into v_no_coord from _batch where geom is null or name is null;
  select count(*) into v_closed   from _batch where geom is not null and name is not null and not is_open;
  select count(*) into v_masked   from _batch where was_masked;

  create temp table _valid on commit drop as
  select b.*, st_y(b.geom) as lat, st_x(b.geom) as lng
  from _batch b
  where b.geom is not null and b.name is not null and b.is_open;

  -- 변환이 어긋나면 좌표가 한반도 밖으로 튄다. 지도에 쓰레기가 박히기 전에 잡는다.
  select count(*) into v_oob
  from _valid where lat not between 33 and 39 or lng not between 124 and 132;

  delete from _valid where lat not between 33 and 39 or lng not between 124 and 132;

  -- 같은 이름이 30m 안에 이미 있으면 건너뛴다(다른 출처로 들어온 같은 가게).
  -- external_id가 같은 건은 업서트 대상이므로 중복으로 치지 않는다.
  create temp table _dup on commit drop as
  select v.row_no
  from _valid v
  where exists (
    select 1 from public.spots sp
     where sp.name = v.name
       and st_dwithin(
             sp.location::geography,
             st_setsrid(st_makepoint(v.lng, v.lat), 4326)::geography,
             30)
       and (sp.external_source is distinct from p_source
            or sp.external_id is distinct from v.external_id)
  );
  select count(*) into v_dup_name from _dup;
  delete from _valid where row_no in (select row_no from _dup);

  select count(*) into v_ready from _valid;

  if not p_dry_run then
    with up as (
      insert into public.spots (
        name, category, location, latitude, longitude,
        address_text, address_road, address_lot,
        external_source, external_id, status, created_source
      )
      select
        v.name, v.category,
        st_setsrid(st_makepoint(v.lng, v.lat), 4326),
        v.lat, v.lng,
        v.address_text, v.address_road, v.address_lot,
        p_source, v.external_id, 'active', 'seed'
      from _valid v
      where v.external_id is not null
      on conflict (external_source, external_id) where external_source is not null and external_id is not null
      do update set
        name         = excluded.name,
        location     = excluded.location,
        latitude     = excluded.latitude,
        longitude    = excluded.longitude,
        address_text = excluded.address_text,
        address_road = excluded.address_road,
        address_lot  = excluded.address_lot,
        updated_at   = now()
      returning 1
    )
    select count(*) into v_written from up;
  end if;

  return jsonb_build_object(
    'batch_id',        p_batch_id,
    'source',          p_source,
    'dry_run',         p_dry_run,
    'total',           v_total,
    'skipped_no_coord_or_name', v_no_coord,
    'skipped_closed',  v_closed,
    'skipped_out_of_korea', v_oob,
    'skipped_dup_nearby',   v_dup_name,
    'address_masked',  v_masked,
    'ready',           v_ready,
    'written',         v_written
  );
end;
$function$;

-- ⚠️ Supabase는 함수 생성 시 anon/authenticated에 EXECUTE를 다시 부여한다.
revoke all on function public.import_localdata_batch(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.import_localdata_batch(uuid, text, boolean) to service_role;

comment on function public.import_localdata_batch(uuid, text, boolean) is
  'localdata_staging의 한 배치를 spots로 적재. EPSG:5174→WGS84 변환, 폐업·범위밖·근접중복 제외. p_dry_run=true면 집계만 반환.';
