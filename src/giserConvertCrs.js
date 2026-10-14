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
      const trimmed = input.trim();
      if (!trimmed) return null;

      // A WKT geometry never starts with `{` or `[`, so a JSON-looking string
      // is unambiguously serialised GeoJSON. Falling back to WKT on a parse
      // failure keeps the error message meaningful for genuine WKT mistakes.
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return ProjectionTransform.transform(JSON.parse(trimmed), fromCRS, toCRS, options);
        } catch (e) {
          if (e instanceof SyntaxError) {
            throw new Error('Invalid input: string looks like JSON GeoJSON but could not be parsed.');
          }
          throw e;
        }
      }

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
