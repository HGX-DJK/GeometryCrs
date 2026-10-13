import GPS from './gps.js';
import ProjectionTransform from './projection.js';
import WKT from './wkt.js';

const giserConvertCrs = {
  GPS,
  ProjectionTransform,
  WKT,

  transform(input, fromCRS, toCRS, options) {
    if (input == null) return null;

    if (typeof input === 'string') {
      // blank / whitespace-only WKT is treated as "no geometry", not an error
      if (!input.trim()) return null;
      const geoJSON = WKT.parse(input);
      const transformed = ProjectionTransform.transform(geoJSON, fromCRS, toCRS, options);
      return WKT.stringify(transformed, options);
    }

    return ProjectionTransform.transform(input, fromCRS, toCRS, options);
  },

  transformPoint(coord, fromCRS, toCRS, options) {
    return this.transform(coord, fromCRS, toCRS, options);
  },

  transformPoints(points, fromCRS, toCRS, options) {
    return this.transform(points, fromCRS, toCRS, options);
  },

  transformGeoJSON(geoJSON, fromCRS, toCRS, options) {
    return this.transform(geoJSON, fromCRS, toCRS, options);
  },

  transformWKT(wkt, fromCRS, toCRS, options) {
    return this.transform(wkt, fromCRS, toCRS, options);
  }
};

export { GPS, ProjectionTransform, WKT };
export default giserConvertCrs;
