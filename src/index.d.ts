export type CRS =
  | 'wgs84'
  | 'wgs-84'
  | 'EPSG:4326'
  | 'epsg:4326'
  | '4326'
  | 'cgcs2000'
  | 'cgcs-2000'
  | 'EPSG:4490'
  | 'epsg:4490'
  | '4490'
  | 'gcj02'
  | 'gcj-02'
  | 'bd09ll'
  | 'bd09'
  | 'bd-09'
  | 'epsg:3857'
  | 'EPSG:3857'
  | '3857'
  | 'epsg:900913'
  | 'EPSG:900913'
  | '900913'
  | 'mercator'
  | 'webmercator'
  | {
      type: 'proj4';
      properties: {
        proj: string;
      };
    }
  | (string & {});

export type Position = [number, number] | [number, number, number] | number[];

export interface Point {
  type: 'Point';
  coordinates: Position;
}

export interface LineString {
  type: 'LineString';
  coordinates: Position[];
}

export interface Polygon {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface MultiPoint {
  type: 'MultiPoint';
  coordinates: Position[];
}

export interface MultiLineString {
  type: 'MultiLineString';
  coordinates: Position[][];
}

export interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export interface GeometryCollection {
  type: 'GeometryCollection';
  geometries: Geometry[];
}

export type Geometry =
  | Point
  | LineString
  | Polygon
  | MultiPoint
  | MultiLineString
  | MultiPolygon
  | GeometryCollection;

export interface Feature<G = Geometry> {
  type: 'Feature';
  geometry: G | null;
  properties?: Record<string, unknown> | null;
  id?: string | number;
  bbox?: number[];
}

export interface FeatureCollection<G = Geometry> {
  type: 'FeatureCollection';
  features: Feature<G>[];
  bbox?: number[];
}

export type GeoJSON = Geometry | Feature | FeatureCollection;

export interface TransformOptions {
  precise?: boolean;
  mutate?: boolean;
  precision?: number;
}

export interface WKTOptions {
  precision?: number;
}

export interface GPSApi {
  PI: number;
  x_pi: number;
  EARTH_RADIUS: number;
  wgs84_gcj02(lon: number, lat: number): [number, number];
  gcj02_wgs84(lon: number, lat: number): [number, number];
  gcj02_wgs84_precise(lon: number, lat: number): [number, number];
  gcj02_bd09ll(lon: number, lat: number): [number, number];
  bd09ll_gcj02(lon: number, lat: number): [number, number];
  bd09ll_gcj02_precise(lon: number, lat: number): [number, number];
  wgs84_bd09ll(lon: number, lat: number): [number, number];
  bd09ll_wgs84(lon: number, lat: number): [number, number];
  bd09ll_wgs84_precise(lon: number, lat: number): [number, number];
  wgs84_epsg3857(lon: number, lat: number): [number, number];
  epsg3857_wgs84(x: number, y: number): [number, number];
  gcj02_epsg3857(lon: number, lat: number): [number, number];
  epsg3857_gcj02(x: number, y: number): [number, number];
  bd09ll_epsg3857(lon: number, lat: number): [number, number];
  epsg3857_bd09ll(x: number, y: number): [number, number];
  outOfChina(lat: number, lon: number): boolean;
  outOfChina(coord: [number, number] | number[]): boolean;
}

export interface ProjectionTransformApi {
  crs: Record<'wgs84' | 'gcj02' | 'bd09ll' | 'epsg3857', string>;
  transform<T extends Position | Position[] | GeoJSON>(
    source: T,
    fromCRS: CRS,
    toCRS: CRS,
    options?: TransformOptions
  ): T;
}

export interface WKTApi {
  parse(wkt: string): Geometry;
  stringify(geojson: Geometry, options?: WKTOptions | number): string;
}

export interface GiserConvertCrs {
  GPS: GPSApi;
  ProjectionTransform: ProjectionTransformApi;
  WKT: WKTApi;
  transform(input: string, fromCRS: CRS, toCRS: CRS, options?: TransformOptions): string;
  transform<T extends Position | Position[] | GeoJSON>(
    input: T,
    fromCRS: CRS,
    toCRS: CRS,
    options?: TransformOptions
  ): T;
  transformPoint<T extends Position>(coord: T, fromCRS: CRS, toCRS: CRS, options?: TransformOptions): T;
  transformPoints<T extends Position[]>(points: T, fromCRS: CRS, toCRS: CRS, options?: TransformOptions): T;
  transformGeoJSON<T extends GeoJSON>(geojson: T, fromCRS: CRS, toCRS: CRS, options?: TransformOptions): T;
  transformWKT(wkt: string, fromCRS: CRS, toCRS: CRS, options?: TransformOptions): string;
}

export type giserConvertCrs = GiserConvertCrs;

export const GPS: GPSApi;
export const ProjectionTransform: ProjectionTransformApi;
export const WKT: WKTApi;

declare const giserConvertCrs: GiserConvertCrs;
export default giserConvertCrs;
