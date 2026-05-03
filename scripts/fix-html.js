#!/usr/bin/env node
/**
 * Expo 웹 빌드 후처리:
 * - script 태그에 type="module" 추가
 *   (번들이 import.meta 등 ES 모듈 문법을 사용하므로 필요)
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const before = (html.match(/<script[^>]*src=/g) || []).length;
html = html.replace(/<script src=/g, '<script type="module" src=');
const after = (html.match(/<script type="module" src=/g) || []).length;

fs.writeFileSync(indexPath, html);
console.log(`fix-html: patched ${after}/${before} script tags with type="module"`);
