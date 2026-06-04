/**
 * ShapeRecognizer: Dynamic geometric shape detection and conversion.
 * Detects: Line, Circle, Rectangle, Triangle, Star.
 */
export class ShapeRecognizer {
  /**
   * Main entrypoint to recognize and convert a rough stroke.
   * @param {Array<{x, y}>} points - The raw points of the stroke
   * @returns {Object|null} - The recognized shape detail with new points, or null if no shape matched
   */
  static recognize(points) {
    if (!points || points.length < 12) return null; // Need enough points to determine shape

    // 1. Resample points to uniform spacing (e.g., 64 points)
    const resampled = this._resample(points, 64);

    // 2. Precompute basic geometric properties
    const centroid = this._getCentroid(resampled);
    const bounds = this._getBoundingBox(resampled);
    const maxDimension = Math.max(bounds.width, bounds.height);
    if (maxDimension < 20) return null; // Too small to recognize

    // Distance metrics
    const distances = resampled.map(p => this._dist(p, centroid));
    const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const distStdDev = Math.sqrt(
      distances.reduce((a, b) => a + Math.pow(b - avgDist, 2), 0) / distances.length
    );

    // Closeness of start and end points
    const startEndDist = this._dist(resampled[0], resampled[resampled.length - 1]);
    const isClosed = startEndDist < avgDist * 0.55 || startEndDist < 45;

    // curvature / Ramer-Douglas-Peucker simplification
    const simplified = this._rdp(resampled, maxDimension * 0.04);
    const numVertices = simplified.length - 1; // last point equals start point if closed

    // === 1. LINE CHECK ===
    const lineError = this._getLineFitError(resampled, resampled[0], resampled[resampled.length - 1]);
    if (lineError < maxDimension * 0.05 && !isClosed) {
      return {
        type: 'line',
        points: this._generateLine(resampled[0], resampled[resampled.length - 1])
      };
    }

    // === 2. CIRCLE CHECK ===
    // Circles have very low distance standard deviation from centroid
    if (isClosed && distStdDev / avgDist < 0.12) {
      return {
        type: 'circle',
        points: this._generateCircle(centroid, avgDist)
      };
    }

    // === 3. TRIANGLE CHECK ===
    if (isClosed && (numVertices === 3 || (numVertices >= 3 && numVertices <= 5))) {
      const triangleVertices = this._rdp(resampled, maxDimension * 0.1);
      if (triangleVertices.length - 1 === 3) {
        return {
          type: 'triangle',
          points: this._generatePolygon(triangleVertices.slice(0, 3))
        };
      }
    }

    // === 4. RECTANGLE CHECK ===
    if (isClosed) {
      // Find oriented bounding box or check RDP vertices
      const rectVertices = this._rdp(resampled, maxDimension * 0.09);
      const verticesCount = rectVertices.length - 1;
      
      // If we simplified to roughly 4 corners, fit a perfect rectangle aligned with bounds
      if (verticesCount === 4 || verticesCount === 3) {
        return {
          type: 'rectangle',
          points: this._generateRectangle(bounds)
        };
      }

      // Fallback: If shape bounds are high overlap with area, make rectangle
      const rectArea = bounds.width * bounds.height;
      const approximatePathArea = this._polygonArea(resampled);
      if (approximatePathArea / rectArea > 0.72) {
        return {
          type: 'rectangle',
          points: this._generateRectangle(bounds)
        };
      }
    }

    // === 5. STAR CHECK ===
    // Analyze peaks and valleys of distances from centroid
    const peaksValleys = this._countPeaksAndValleys(distances);
    if (isClosed && peaksValleys.peaks === 5) {
      return {
        type: 'star',
        points: this._generateStar(centroid, avgDist * 1.35, avgDist * 0.55)
      };
    }

    return null; // Not recognized confidently
  }

  // === RESAMPLING & SIMPLIFICATION ===

  static _resample(points, n) {
    const I = this._pathLength(points) / (n - 1);
    let D = 0.0;
    const newPoints = [{ ...points[0] }];
    let i = 1;

    while (i < points.length) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const d = this._dist(p1, p2);

      if (D + d >= I) {
        const qx = p1.x + ((I - D) / d) * (p2.x - p1.x);
        const qy = p1.y + ((I - D) / d) * (p2.y - p1.y);
        const q = {
          x: qx,
          y: qy,
          time: p2.time || Date.now(),
          pressure: p2.pressure || 0.5,
          velocity: p2.velocity || 0
        };
        newPoints.push(q);
        points.splice(i, 0, q); // insert q as the next point
        D = 0.0;
      } else {
        D += d;
      }
      i++;
    }

    // Ensure we have exactly n points
    while (newPoints.length < n) {
      newPoints.push({ ...points[points.length - 1] });
    }
    if (newPoints.length > n) {
      newPoints.length = n;
    }
    return newPoints;
  }

  static _rdp(points, epsilon) {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const d = this._distToSegment(points[i], points[0], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > epsilon) {
      const recResults1 = this._rdp(points.slice(0, index + 1), epsilon);
      const recResults2 = this._rdp(points.slice(index), epsilon);
      return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
    } else {
      return [points[0], points[end]];
    }
  }

  // === MATHEMATICAL HELPERS ===

  static _dist(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  }

  static _pathLength(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += this._dist(points[i - 1], points[i]);
    }
    return d;
  }

  static _getCentroid(points) {
    let x = 0, y = 0;
    for (const p of points) { x += p.x; y += p.y; }
    return { x: x / points.length, y: y / points.length };
  }

  static _getBoundingBox(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      cx: minX + (maxX - minX) / 2,
      cy: minY + (maxY - minY) / 2
    };
  }

  static _distToSegment(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return this._dist(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return this._dist(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
  }

  static _getLineFitError(points, p1, p2) {
    let error = 0;
    for (const p of points) {
      error += this._distToSegment(p, p1, p2);
    }
    return error / points.length;
  }

  static _polygonArea(points) {
    let area = 0;
    const j = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      area += (p1.x + p2.x) * (p1.y - p2.y);
    }
    return Math.abs(area / 2);
  }

  static _countPeaksAndValleys(distances) {
    let peaks = 0;
    let valleys = 0;
    
    // Smooth distances with moving average
    const smoothed = [];
    const windowSize = 5;
    for (let i = 0; i < distances.length; i++) {
      let sum = 0;
      for (let w = -windowSize; w <= windowSize; w++) {
        const idx = (i + w + distances.length) % distances.length;
        sum += distances[idx];
      }
      smoothed.push(sum / (windowSize * 2 + 1));
    }

    // Find local extrema
    for (let i = 0; i < smoothed.length; i++) {
      const prev = smoothed[(i - 1 + smoothed.length) % smoothed.length];
      const curr = smoothed[i];
      const next = smoothed[(i + 1) % smoothed.length];

      if (curr > prev && curr > next) {
        peaks++;
      } else if (curr < prev && curr < next) {
        valleys++;
      }
    }

    return { peaks, valleys };
  }

  // === SHAPE GENERATORS ===

  static _generateLine(p1, p2) {
    const points = [];
    const steps = 30;
    const now = Date.now();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push({
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
        time: now,
        pressure: 0.5,
        velocity: 0
      });
    }
    return points;
  }

  static _generateCircle(centroid, r) {
    const points = [];
    const steps = 80;
    const now = Date.now();
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * 2.0 * Math.PI;
      points.push({
        x: centroid.x + r * Math.cos(theta),
        y: centroid.y + r * Math.sin(theta),
        time: now,
        pressure: 0.5,
        velocity: 0
      });
    }
    return points;
  }

  static _generateRectangle(bounds) {
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y } // Close path
    ];
    return this._generatePolygon(corners);
  }

  static _generatePolygon(vertices) {
    const points = [];
    const now = Date.now();
    for (let i = 0; i < vertices.length - 1; i++) {
      const v1 = vertices[i];
      const v2 = vertices[i + 1];
      const steps = 15;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        points.push({
          x: v1.x + t * (v2.x - v1.x),
          y: v1.y + t * (v2.y - v1.y),
          time: now,
          pressure: 0.5,
          velocity: 0
        });
      }
    }
    // Add final vertex
    points.push({
      x: vertices[vertices.length - 1].x,
      y: vertices[vertices.length - 1].y,
      time: now,
      pressure: 0.5,
      velocity: 0
    });
    return points;
  }

  static _generateStar(centroid, rOuter, rInner) {
    const points = [];
    const spikes = 5;
    const now = Date.now();

    for (let i = 0; i <= spikes * 2; i++) {
      const angle = (i / (spikes * 2)) * 2.0 * Math.PI - Math.PI / 2;
      const r = i % 2 === 0 ? rOuter : rInner;
      points.push({
        x: centroid.x + r * Math.cos(angle),
        y: centroid.y + r * Math.sin(angle),
        time: now,
        pressure: 0.5,
        velocity: 0
      });
    }
    return points;
  }
}
