/**
 * DiagramBuilder: Translates shape nodes and connecting lines/arrows into Mermaid.js graph code.
 */
export class DiagramBuilder {
  /**
   * Generates Mermaid diagram code from existing strokes.
   * @param {Array<Object>} strokes - All strokes in the workspace
   * @returns {string} - Mermaid graph definition
   */
  static generate(strokes) {
    if (!strokes || strokes.length === 0) {
      return 'graph TD\n  Start([AirDraw Canvas])';
    }

    // 1. Separate strokes into nodes (shapes) and edges (lines/arrows)
    const nodes = [];
    const connections = [];

    strokes.forEach((stroke) => {
      // Get bounding details
      const bounds = this._getStrokeBounds(stroke.points);
      const centroid = { x: bounds.cx, y: bounds.cy };

      // Check if it's a recognized node shape
      const isShape = stroke.points.length > 0 && 
        (stroke.shapeType === 'rectangle' || stroke.shapeType === 'circle' || stroke.shapeType === 'triangle');

      if (isShape) {
        nodes.push({
          id: `node_${stroke.id}`,
          label: this._getNodeLabel(stroke) || `Node ${stroke.id}`,
          type: stroke.shapeType,
          centroid,
          bounds
        });
      } else {
        // Line/Arrow candidate
        if (stroke.points.length >= 2) {
          connections.push({
            id: stroke.id,
            start: stroke.points[0],
            end: stroke.points[stroke.points.length - 1],
            isArrow: stroke.shapeType === 'arrow' || this._isArrowLike(stroke.points)
          });
        }
      }
    });

    if (nodes.length === 0) {
      return 'graph TD\n  Empty["No shapes detected. Draw rectangles/circles!"]';
    }

    // 2. Pair connections with nodes based on distance
    const edges = [];
    const connectionThreshold = 80; // px max distance to connect

    connections.forEach((conn) => {
      let nearestSource = null;
      let nearestTarget = null;
      let minDistSource = connectionThreshold;
      let minDistTarget = connectionThreshold;

      nodes.forEach((node) => {
        // Distance from connection start to node centroid
        const dStart = this._dist(conn.start, node.centroid);
        if (dStart < minDistSource) {
          minDistSource = dStart;
          nearestSource = node;
        }

        // Distance from connection end to node centroid
        const dEnd = this._dist(conn.end, node.centroid);
        if (dEnd < minDistTarget) {
          minDistTarget = dEnd;
          nearestTarget = node;
        }
      });

      // If we found a valid connection between two distinct nodes, add it
      if (nearestSource && nearestTarget && nearestSource.id !== nearestTarget.id) {
        edges.push({
          source: nearestSource.id,
          target: nearestTarget.id,
          isArrow: conn.isArrow
        });
      }
    });

    // 3. Construct Mermaid graph syntax
    let mermaidCode = 'graph TD\n';
    
    // Define nodes with styling based on shape type
    nodes.forEach((node) => {
      const label = node.label.replace(/"/g, '\\"');
      if (node.type === 'circle') {
        mermaidCode += `  ${node.id}(("${label}"))\n`;
      } else if (node.type === 'triangle') {
        mermaidCode += `  ${node.id}>"${label}"]\n`;
      } else {
        mermaidCode += `  ${node.id}["${label}"]\n`;
      }
    });

    // Define edges
    if (edges.length === 0) {
      // Connect nodes sequentially if no lines are drawn yet (implicit flow)
      for (let i = 0; i < nodes.length - 1; i++) {
        mermaidCode += `  ${nodes[i].id} --> ${nodes[i + 1].id}\n`;
      }
    } else {
      edges.forEach((edge) => {
        const connector = edge.isArrow ? '-->' : '---';
        mermaidCode += `  ${edge.source} ${connector} ${edge.target}\n`;
      });
    }

    return mermaidCode;
  }

  // === INTERNAL HELPERS ===

  static _getStrokeBounds(points) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      cx: minX + (maxX - minX) / 2,
      cy: minY + (maxY - minY) / 2
    };
  }

  static _dist(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  }

  static _getNodeLabel(stroke) {
    // If OCR text was recognized on this stroke, use it as label!
    if (stroke.ocrText) {
      return stroke.ocrText;
    }
    return null;
  }

  static _isArrowLike(points) {
    // Simplistic heuristic: check if path contains a sharp fold near the end
    if (points.length < 5) return false;
    const endIdx = points.length - 1;
    const p1 = points[endIdx];
    const p2 = points[endIdx - 2];
    const p3 = points[endIdx - 4];
    
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const len1 = Math.sqrt(v1.x**2 + v1.y**2);
    const len2 = Math.sqrt(v2.x**2 + v2.y**2);
    
    if (len1 > 0 && len2 > 0) {
      const cosAngle = dot / (len1 * len2);
      if (cosAngle < 0.2) return true; // Sharp fold indicating arrow barb
    }
    return false;
  }
}
