export type CRS =
  | 'wgs84'
  | 'wgs-84'
  | 'EPSG:4326'
  | 'epsg:4326'
  | 'gcj02'
  | 'gcj-02'
  | 'bd09ll'
  | 'bd09'
  | 'bd-09'
  | {
      type: 'proj4';
      properties: {
        proj: string;
      };
    };

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
}

export interface FeatureCollection<G = Geometry> {
  type: 'FeatureCollection';
  features: Feature<G>[];
}

export type GeoJSON = Geometry | Feature | FeatureCollection;

export interface GPSApi {
  wgs84_gcj02(lon: number, lat: number): [number, number];
  gcj02_wgs84(lon: number, lat: number): [number, number];
  gcj02_wgs84_precise(lon: number, lat: number): [number, number];
  gcj02_bd09ll(lon: number, lat: number): [number, number];
  bd09ll_gcj02(lon: number, lat: number): [number, number];
  wgs84_bd09ll(lon: number, lat: number): [number, number];
  bd09ll_wgs84(lon: number, lat: number): [number, number];
  bd09ll_wgs84_precise(lon: number, lat: number): [number, number];
  outOfChina(lat: number, lon: number): boolean;
}

export interface ProjectionTransformApi {
  crs: Record<'wgs84' | 'gcj02' | 'bd09ll', string>;
  transform<T extends Position | Position[] | GeoJSON>(source: T, fromCRS: CRS, toCRS: CRS): T;
}

export interface WKTApi {
  parse(wkt: string): Geometry;
  stringify(geojson: Geometry): string;
}

export interface giserConvertCrs {
  GPS: GPSApi;
  ProjectionTransform: ProjectionTransformApi;
  WKT: WKTApi;
  transform(input: string, fromCRS: CRS, toCRS: CRS): string;
  transform<T extends Position | Position[] | GeoJSON>(input: T, fromCRS: CRS, toCRS: CRS): T;
  transformPoint<T extends Position>(coord: T, fromCRS: CRS, toCRS: CRS): T;
  transformPoints<T extends Position[]>(points: T, fromCRS: CRS, toCRS: CRS): T;
  transformGeoJSON<T extends GeoJSON>(geojson: T, fromCRS: CRS, toCRS: CRS): T;
  transformWKT(wkt: string, fromCRS: CRS, toCRS: CRS): string;
}

export const GPS: GPSApi;
export const ProjectionTransform: ProjectionTransformApi;
export const WKT: WKTApi;

declare const giserConvertCrs: giserConvertCrs;
export default giserConvertCrs;
