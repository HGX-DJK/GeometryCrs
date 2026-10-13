const TYPE_MAP = {
  POINT: 'Point',
  LINESTRING: 'LineString',
  POLYGON: 'Polygon',
  MULTIPOINT: 'MultiPoint',
  MULTILINESTRING: 'MultiLineString',
  MULTIPOLYGON: 'MultiPolygon',
  GEOMETRYCOLLECTION: 'GeometryCollection'
};

const REVERSE_TYPE_MAP = Object.fromEntries(
  Object.entries(TYPE_MAP).map(([wktType, geoJSONType]) => [geoJSONType, wktType])
);

const WKT = {
  parse(wkt) {
    if (typeof wkt !== 'string' || !wkt.trim()) {
      throw new Error('Invalid WKT string.');
    }

    const source = wkt.trim();
    const header = source.match(/^([A-Za-z]+)(?:\s+(ZM|Z|M))?\s*/i);
    if (!header) throw new Error('Invalid WKT string.');

    const wktType = header[1].toUpperCase();
    const geoJSONType = TYPE_MAP[wktType];
    if (!geoJSONType) throw new Error(`Unsupported WKT type: ${wktType}.`);

    const body = source.slice(header[0].length).trim();
    if (/^EMPTY$/i.test(body)) {
      if (geoJSONType === 'GeometryCollection') {
        return { type: geoJSONType, geometries: [] };
      }
      return { type: geoJSONType, coordinates: this._emptyCoordinates(geoJSONType) };
    }

    if (!body.startsWith('(') || !body.endsWith(')')) {
      throw new Error('Invalid WKT string: missing coordinate parentheses.');
    }

    const content = this._stripOuterParens(body);

    if (geoJSONType === 'GeometryCollection') {
      return {
        type: 'GeometryCollection',
        geometries: this._splitTopLevel(content).map(item => this.parse(item))
      };
    }

    return {
      type: geoJSONType,
      coordinates: this._parseCoordinates(content, geoJSONType)
    };
  },

  stringify(geoJSON, options = {}) {
    if (!geoJSON || typeof geoJSON !== 'object' || !geoJSON.type) {
      throw new Error('Invalid GeoJSON.');
    }

    const wktType = REVERSE_TYPE_MAP[geoJSON.type];
    if (!wktType) throw new Error(`Unsupported geometry type: ${geoJSON.type}.`);

    const precision = typeof options === 'number' ? options : options?.precision;

    if (geoJSON.type === 'GeometryCollection') {
      if (!Array.isArray(geoJSON.geometries) || geoJSON.geometries.length === 0) {
        return 'GEOMETRYCOLLECTION EMPTY';
      }
      return `GEOMETRYCOLLECTION(${geoJSON.geometries.map(geom => this.stringify(geom, options)).join(', ')})`;
    }

    const coords = geoJSON.coordinates;
    if (this._isEmpty(coords)) return `${wktType} EMPTY`;

    return `${wktType}(${this._stringifyCoordinates(coords, geoJSON.type, precision)})`;
  },

  _parseCoordinates(content, type) {
    switch (type) {
      case 'Point':
        return this._parsePoint(content);
      case 'LineString':
        return this._parsePointList(content);
      case 'Polygon':
        return this._parsePolygon(content);
      case 'MultiPoint':
        return this._parseMultiPoint(content);
      case 'MultiLineString':
        return this._splitTopLevel(content).map(line => this._parsePointList(this._stripOptionalOuterParens(line)));
      case 'MultiPolygon':
        return this._splitTopLevel(content).map(poly => this._parsePolygon(this._stripOptionalOuterParens(poly)));
      default:
        throw new Error(`Unsupported geometry type: ${type}.`);
    }
  },

  _parsePoint(value) {
    const numbers = value.trim().split(/\s+/).filter(Boolean).map(Number);
    if (numbers.length < 2 || numbers.some(n => !Number.isFinite(n))) {
      throw new Error(`Invalid WKT coordinate: ${value}.`);
    }
    return numbers;
  },

  _parsePointList(value) {
    const points = this._splitTopLevel(value).map(part => this._parsePoint(this._stripOptionalOuterParens(part)));
    if (!points.length) throw new Error('Invalid WKT coordinate list.');
    return points;
  },

  _parsePolygon(value) {
    const rings = this._splitTopLevel(value).map(ring => this._parsePointList(this._stripOptionalOuterParens(ring)));
    if (!rings.length) throw new Error('Invalid WKT polygon.');
    return rings;
  },

  _parseMultiPoint(value) {
    return this._splitTopLevel(value).map(point => this._parsePoint(this._stripOptionalOuterParens(point)));
  },

  _splitTopLevel(value) {
    const parts = [];
    let depth = 0;
    let start = 0;

    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (char === '(') depth++;
      else if (char === ')') depth--;

      if (depth < 0) throw new Error('Invalid WKT string: unbalanced parentheses.');

      if (char === ',' && depth === 0) {
        parts.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }

    if (depth !== 0) throw new Error('Invalid WKT string: unbalanced parentheses.');
    const last = value.slice(start).trim();
    if (last) parts.push(last);
    return parts;
  },

  _stripOuterParens(value) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
      throw new Error('Invalid WKT string: missing coordinate parentheses.');
    }
    return trimmed.slice(1, -1).trim();
  },

  _stripOptionalOuterParens(value) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('(')) return trimmed;
    return this._stripOuterParens(trimmed);
  },

  _stringifyCoordinates(coords, type, precision) {
    switch (type) {
      case 'Point':
        return this._stringifyPoint(coords, precision);
      case 'LineString':
        return this._stringifyPointList(coords, precision);
      case 'Polygon':
        return this._stringifyPolygon(coords, precision);
      case 'MultiPoint':
        return coords.map(point => `(${this._stringifyPoint(point, precision)})`).join(', ');
      case 'MultiLineString':
        return coords.map(line => `(${this._stringifyPointList(line, precision)})`).join(', ');
      case 'MultiPolygon':
        return coords.map(poly => `(${this._stringifyPolygon(poly, precision)})`).join(', ');
      default:
        throw new Error(`Unsupported geometry type: ${type}.`);
    }
  },

  _stringifyPoint(point, precision) {
    if (!Array.isArray(point) || point.length < 2) throw new Error('Invalid coordinate.');
    return point.map(value => {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error('Invalid coordinate value.');
      if (typeof precision === 'number' && precision >= 0) {
        return Number(number.toFixed(precision)).toString();
      }
      return String(number);
    }).join(' ');
  },

  _stringifyPointList(points, precision) {
    if (!Array.isArray(points)) throw new Error('Invalid coordinate list.');
    return points.map(point => this._stringifyPoint(point, precision)).join(', ');
  },

  _stringifyPolygon(rings, precision) {
    if (!Array.isArray(rings)) throw new Error('Invalid polygon coordinates.');
    return rings.map(ring => `(${this._stringifyPointList(ring, precision)})`).join(', ');
  },

  _emptyCoordinates(type) {
    return [];
  },

  _isEmpty(coords) {
    return Array.isArray(coords) && coords.length === 0;
  }
};

export default WKT;
