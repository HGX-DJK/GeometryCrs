import GPS from './gps.js';
import ProjectionTransform from './projection.js';
import WKT from './wkt.js';

const giserConvertCrs = {
  GPS,
  ProjectionTransform,
  WKT,

  transform(input, fromCRS, toCRS) {
    if (input == null || input === '') return null;

    if (typeof input === 'string') {
      const geoJSON = WKT.parse(input);
      return WKT.stringify(ProjectionTransform.transform(geoJSON, fromCRS, toCRS));
    }

    return ProjectionTransform.transform(input, fromCRS, toCRS);
  },

  transformPoint(coord, fromCRS, toCRS) {
    return this.transform(coord, fromCRS, toCRS);
  },

  transformPoints(points, fromCRS, toCRS) {
    return this.transform(points, fromCRS, toCRS);
  },

  transformGeoJSON(geoJSON, fromCRS, toCRS) {
    return this.transform(geoJSON, fromCRS, toCRS);
  },

  transformWKT(wkt, fromCRS, toCRS) {
    return this.transform(wkt, fromCRS, toCRS);
  }
};

export { GPS, ProjectionTransform, WKT };
export default giserConvertCrs;
