# giserConvertCrs

`giserConvertCrs` 是一个几何坐标系转换工具库，支持 WGS-84、GCJ-02、BD-09 之间的点、线、面、数组、GeoJSON 和 WKT 转换。

> 注意：npm 包名需要保持小写，因此发布包名仍为 `giser-convert-crs`；代码变量、浏览器全局变量、构建文件名统一使用 `giserConvertCrs`。

## 坐标系写法

所有转换方法的 `fromCRS` 和 `toCRS` 都支持下面这些写法：

| 坐标系 | 可用写法 |
| --- | --- |
| WGS-84 | `wgs84`, `wgs-84`, `EPSG:4326`, `epsg:4326` |
| GCJ-02 | `gcj02`, `gcj-02` |
| BD-09 | `bd09ll`, `bd09`, `bd-09` |

```js
giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');
giserConvertCrs.transform([116.397, 39.908], 'EPSG:4326', 'bd09');
giserConvertCrs.transform([116.397, 39.908], 'bd-09', 'wgs84');
```

坐标顺序固定为 `[lon, lat]`，即经度在前、纬度在后。三维坐标也支持，例如 `[lon, lat, height]`，转换后会保留高度值。

## 支持的输入

### 单个点

```js
[116.397, 39.908]
[116.397, 39.908, 45]
```

### 点数组

```js
[
  [116.397, 39.908],
  [117.2, 40.1]
]
```

### GeoJSON

`giserConvertCrs.transformGeoJSON(geojson, 'wgs84', 'gcj02')` 里的 `geojson` 是标准 GeoJSON 几何对象、Feature 或 FeatureCollection。

Point：

```js
const geojson = {
  type: 'Point',
  coordinates: [116.397, 39.908]
};

giserConvertCrs.transformGeoJSON(geojson, 'wgs84', 'gcj02');
```

LineString：

```js
const geojson = {
  type: 'LineString',
  coordinates: [
    [116.397, 39.908],
    [117.2, 40.1]
  ]
};

giserConvertCrs.transformGeoJSON(geojson, 'wgs84', 'gcj02');
```

Polygon：

```js
const geojson = {
  type: 'Polygon',
  coordinates: [[
    [116.0, 39.9],
    [116.1, 39.9],
    [116.1, 40.0],
    [116.0, 39.9]
  ]]
};

giserConvertCrs.transformGeoJSON(geojson, 'wgs84', 'gcj02');
```

FeatureCollection：

```js
const geojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: '点' },
      geometry: {
        type: 'Point',
        coordinates: [116.397, 39.908]
      }
    },
    {
      type: 'Feature',
      properties: { name: '线' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [116.397, 39.908],
          [117.2, 40.1]
        ]
      }
    }
  ]
};

giserConvertCrs.transformGeoJSON(geojson, 'wgs84', 'gcj02');
```

还支持 `MultiPoint`、`MultiLineString`、`MultiPolygon`、`GeometryCollection`。

### WKT

```js
'POINT(116.397 39.908)'
'LINESTRING(116 39, 117 40)'
'POLYGON((116 39, 117 39, 117 40, 116 39))'
'MULTIPOINT((116 39), (117 40))'
'MULTILINESTRING((116 39, 117 40), (118 41, 119 42))'
'MULTIPOLYGON(((116 39, 117 39, 117 40, 116 39)))'
```

## 安装

```bash
npm install giser-convert-crs
```

## 引入方式

### ES Module

```js
import giserConvertCrs, { WKT, GPS } from 'giser-convert-crs';

const point = giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');
const geometry = WKT.parse('LINESTRING(116 39, 117 40)');
const bd09 = GPS.wgs84_bd09ll(116.397, 39.908);
```

### Script

```html
<script src="https://unpkg.com/giser-convert-crs/dist/giserConvertCrs.umd.js"></script>
<script>
  const point = giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');
</script>
```

## API

### `giserConvertCrs.transform(input, fromCRS, toCRS)`

统一转换入口，会根据输入类型自动处理：

- 输入坐标数组时，返回坐标数组。
- 输入 GeoJSON 时，返回同结构的新 GeoJSON。
- 输入 WKT 字符串时，返回 WKT 字符串。

```js
giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');
giserConvertCrs.transform([[116.397, 39.908], [117.2, 40.1]], 'wgs84', 'bd09ll');
giserConvertCrs.transform('LINESTRING(116 39, 117 40)', 'wgs84', 'gcj02');
```

### `giserConvertCrs.transformPoint(coord, fromCRS, toCRS)`

```js
giserConvertCrs.transformPoint([116.397, 39.908], 'wgs84', 'gcj02');
```

### `giserConvertCrs.transformPoints(points, fromCRS, toCRS)`

```js
giserConvertCrs.transformPoints([[116.397, 39.908], [117.2, 40.1]], 'wgs84', 'gcj02');
```

### `giserConvertCrs.transformGeoJSON(geojson, fromCRS, toCRS)`

```js
const result = giserConvertCrs.transformGeoJSON(geojson, 'wgs84', 'gcj02');
```

### `giserConvertCrs.transformWKT(wkt, fromCRS, toCRS)`

```js
giserConvertCrs.transformWKT('POINT(116.397 39.908)', 'wgs84', 'gcj02');
giserConvertCrs.transformWKT('POLYGON((116 39, 117 39, 117 40, 116 39))', 'wgs84', 'gcj02');
```

### `giserConvertCrs.WKT`

```js
const geojson = giserConvertCrs.WKT.parse('MULTIPOINT((116 39), (117 40))');
const wkt = giserConvertCrs.WKT.stringify({
  type: 'LineString',
  coordinates: [[116, 39, 10], [117, 40, 20]]
});
```

### `giserConvertCrs.GPS`

```js
giserConvertCrs.GPS.wgs84_gcj02(116.397, 39.908);
giserConvertCrs.GPS.gcj02_wgs84(116.403243, 39.909403);
giserConvertCrs.GPS.gcj02_wgs84_precise(116.403243, 39.909403);
giserConvertCrs.GPS.gcj02_bd09ll(116.403243, 39.909403);
giserConvertCrs.GPS.bd09ll_gcj02(116.409, 39.915);
giserConvertCrs.GPS.wgs84_bd09ll(116.397, 39.908);
giserConvertCrs.GPS.bd09ll_wgs84(116.409, 39.915);
```

## 注意事项

1. 坐标顺序固定为 `[lon, lat]`。
2. WGS-84 和 GCJ-02 的加偏转换只对中国范围内坐标生效，中国境外坐标会原样返回。
3. `gcj02_wgs84` 是常规近似反算，`gcj02_wgs84_precise` 是更高精度反算。
4. 不支持的坐标系会抛出错误，例如 `epsg:3857`。

## License

MIT
