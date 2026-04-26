/**
 * react-native-maps 웹 shim
 * 웹에서는 map.web.tsx가 렌더링되므로 이 파일은 빈 export만 제공합니다.
 */
import React from 'react';
import { View } from 'react-native';

const MapView = (props) => React.createElement(View, props);
MapView.Animated = MapView;

export default MapView;
export const Marker = (props) => React.createElement(View, props);
export const Polyline = (props) => React.createElement(View, props);
export const Polygon = (props) => React.createElement(View, props);
export const Circle = (props) => React.createElement(View, props);
export const Callout = (props) => React.createElement(View, props);
export const CalloutSubview = (props) => React.createElement(View, props);
export const Overlay = (props) => React.createElement(View, props);
export const UrlTile = (props) => React.createElement(View, props);
export const LocalTile = (props) => React.createElement(View, props);
export const MapLocalTile = (props) => React.createElement(View, props);
export const AnimatedRegion = class {};
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;
