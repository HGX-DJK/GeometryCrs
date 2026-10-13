# giserConvertCrs

`giserConvertCrs` 是一个高性能几何坐标系转换工具库，支持 WGS-84、GCJ-02、BD-09、Web Mercator (EPSG:3857) 与 CGCS2000 之间的点、线、面、数组、GeoJSON 和 WKT 转换。

> 注意：npm 包名需要保持小写，因此发布包名仍为 `giser-convert-crs`；代码变量、浏览器全局变量、构建文件名统一使用 `giserConvertCrs`。

## 坐标系支持

所有转换方法的 `fromCRS` 和 `toCRS` 都支持大小写不敏感与常见别名写法：

| 坐标系 | 说明 | 可用写法 |
| --- | --- | --- |
| WGS-84 | 国际标准经纬度 | `wgs84`, `wgs-84`, `EPSG:4326`, `epsg:4326`, `4326` |
| CGCS2000 | 2000国家大地坐标系 | `cgcs2000`, `cgcs-2000`, `EPSG:4490`, `epsg:4490`, `4490` |
| GCJ-02 | 国测局火星坐标系（高德、腾讯） | `gcj02`, `gcj-02` |
| BD-09 | 百度经纬度坐标系 | `bd09ll`, `bd09`, `bd-09` |
| Web Mercator | 墨卡托平面米制投影（Mapbox/Leaflet 底图） | `EPSG:3857`, `epsg:3857`, `3857`, `EPSG:900913`, `webmercator` |

```js
// 常见转换示例
giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');
giserConvertCrs.transform([116.397, 39.908], 'EPSG:4326', 'bd09');
giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'EPSG:3857');
giserConvertCrs.transform([116.397, 39.908], 'cgcs2000', 'gcj02');
```

坐标顺序固定为 `[lon, lat]`，即经度在前、纬度在后。三维坐标也支持，例如 `[lon, lat, height]`，转换后会保留高度值。

## 支持的输入格式

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

支持标准 GeoJSON 几何对象（Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection）以及 Feature 与 FeatureCollection。如果包含 `bbox` 包围盒，会同步转换。

```js
const geojson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: '示例点' },
      geometry: {
        type: 'Point',
        coordinates: [116.397, 39.908]
      }
    }
  ]
};

giserConvertCrs.transformGeoJSON(geojson, 'wgs84', 'gcj02');
```

### WKT

支持 Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, GeometryCollection：

```js
'POINT(116.397 39.908)'
'LINESTRING(116 39, 117 40)'
'POLYGON((116 39, 117 39, 117 40, 116 39))'
'GEOMETRYCOLLECTION(POINT(116 39), LINESTRING(116 39, 117 40))'
```

## 安装

```bash
npm install giser-convert-crs
```

## 引入方式

### ES Module

```js
import giserConvertCrs, { WKT, GPS, ProjectionTransform } from 'giser-convert-crs';

const point = giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');
const mercator = giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'EPSG:3857');
```

### Script 标签（CDN 或本地）

```html
<!-- 生产压缩版 -->
<script src="https://unpkg.com/giser-convert-crs/dist/giserConvertCrs.min.js"></script>
<script>
  const point = giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');
</script>
```

## API 说明

### `giserConvertCrs.transform(input, fromCRS, toCRS, options)`

统一转换入口，自动识别输入类型（坐标数组、GeoJSON、WKT 字符串），并返回对应结构。

**配置项 `options`**（可选）：
- `mutate` (`boolean`, 默认 `false`)：大数据量优化选项。设为 `true` 时直接在原坐标数组上就地修改，零内存开销，大幅降低 GC 压力。
- `precise` (`boolean`, 默认 `true`)：逆算反解精度模式。开启后反算误差在 $10^{-10}$ 度（亚毫米级）以内。
- `precision` (`number`, 可选)：当输出为 WKT 字符串时，控制保留的小数位数（如 `precision: 6`）。

```js
// 常规转换
giserConvertCrs.transform([116.397, 39.908], 'wgs84', 'gcj02');

// 大数据量数组就地修改（极速零拷贝模式）
giserConvertCrs.transform(hugePointArray, 'wgs84', 'gcj02', { mutate: true });

// WKT 输出保留 6 位小数
giserConvertCrs.transform('POINT(116.39712345 39.90812345)', 'wgs84', 'gcj02', { precision: 6 });
```

### `giserConvertCrs.transformPoint(coord, fromCRS, toCRS, options)`

```js
giserConvertCrs.transformPoint([116.397, 39.908], 'wgs84', 'gcj02');
```

### `giserConvertCrs.transformPoints(points, fromCRS, toCRS, options)`

```js
giserConvertCrs.transformPoints([[116.397, 39.908], [117.2, 40.1]], 'wgs84', 'gcj02');
```

### `giserConvertCrs.transformGeoJSON(geojson, fromCRS, toCRS, options)`

```js
const result = giserConvertCrs.transformGeoJSON(geojson, 'wgs84', 'gcj02');
```

### `giserConvertCrs.transformWKT(wkt, fromCRS, toCRS, options)`

```js
giserConvertCrs.transformWKT('POINT(116.397 39.908)', 'wgs84', 'gcj02', { precision: 6 });
```

### `giserConvertCrs.WKT`

```js
// 解析 WKT 为 GeoJSON
const geojson = giserConvertCrs.WKT.parse('MULTIPOINT((116 39), (117 40))');

// 序列化为 WKT，支持可选精度设置
const wkt = giserConvertCrs.WKT.stringify({
  type: 'LineString',
  coordinates: [[116, 39, 10], [117, 40, 20]]
}, { precision: 6 });
```

### `giserConvertCrs.GPS` 底层算法

```js
// GCJ-02 与 WGS-84
GPS.wgs84_gcj02(116.397, 39.908);
GPS.gcj02_wgs84(116.403243, 39.909403);         // 单次近似反算
GPS.gcj02_wgs84_precise(116.403243, 39.909403); // 3次定点高精度迭代反算

// BD-09 与 GCJ-02 / WGS-84
GPS.gcj02_bd09ll(116.403243, 39.909403);
GPS.bd09ll_gcj02(116.409, 39.915);
GPS.bd09ll_gcj02_precise(116.409, 39.915);
GPS.wgs84_bd09ll(116.397, 39.908);
GPS.bd09ll_wgs84_precise(116.409, 39.915);

// Web Mercator (EPSG:3857)
GPS.wgs84_epsg3857(116.397, 39.908);
GPS.epsg3857_wgs84(12957254.77, 4852582.08);
```

## 注意事项

1. 经纬度坐标顺序固定为 `[lon, lat]`。
2. WGS-84 与 GCJ-02 的加偏转换只对中国国境内坐标生效，境外坐标自动原样返回。
3. CGCS2000（国家2000坐标系）在民用级精度下长半轴与 WGS-84 完全一致，扁率差异在 0.1 毫米以内，已无缝别名支持。
4. 如需处理大规模轨迹流或大文件 GeoJSON，推荐开启 `{ mutate: true }` 选项以消除内存与 GC 开销。

## License

MIT
