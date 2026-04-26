import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Colors, Typography, Radius, Spacing, Shadow } from '../../constants/tokens';
import { Icon } from './Icon';
import type { FamiliarDogCardViewModel } from '../../types';

interface Props {
  dog: FamiliarDogCardViewModel;
}

export function FamiliarDogCard({ dog }: Props) {
  return (
    <View style={[s.card, Shadow.s]}>
      {/* 아바타 */}
      <View style={s.avatarWrap}>
        {dog.avatar_url ? (
          <Image source={{ uri: dog.avatar_url }} style={s.avatarImg} resizeMode="cover" />
        ) : (
          <View style={s.avatarPlaceholder}>
            <Text style={s.avatarInitial}>{dog.name[0]}</Text>
          </View>
        )}
      </View>

      {/* 이름 */}
      <Text style={s.name} numberOfLines={1}>{dog.name}</Text>

      {/* 품종·나이 */}
      <Text style={s.breedAge} numberOfLines={1}>{dog.breed_age_text}</Text>

      {/* 마지막 목격 */}
      <Text style={s.lastSeen}>최근 {dog.last_seen_text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    width: 110,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.card,
    paddingVertical: Spacing[14],
    paddingHorizontal: Spacing[10],
    alignItems: 'center',
    gap: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.border.default,
  },
  avatarWrap: {
    width: 56, height: 56, borderRadius: 28,
    overflow: 'hidden',
    marginBottom: Spacing[6],
    borderWidth: 2,
    borderColor: Colors.border.brand,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    flex: 1,
    backgroundColor: Colors.brand.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...Typography.title.s,
    color: Colors.brand.accent,
    fontWeight: '700',
  },
  name: {
    ...Typography.label.m,
    color: Colors.text.primary,
    fontWeight: '600',
    textAlign: 'center',
  },
  breedAge: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
  },
  lastSeen: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: 2,
  },
});
