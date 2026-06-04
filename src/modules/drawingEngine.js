import { TransformEngine } from './transformEngine';

export class DrawingEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * @param {Array} strokes - All committed strokes from StrokeManager
   * @param {Object|null} currentPath - The in-progress drawing path
   * @param {number|null} selectedStrokeId - ID of stroke selected by control hand
   * @param {string} controlGesture - Current control gesture for visual guides
   */
  draw(strokes, currentPath = null, selectedStrokeId = null, controlGesture = 'CTRL_IDLE') {
    this.clearCanvas();
    const ctx = this.ctx;

    const allStrokes = [...strokes];
    if (currentPath) allStrokes.push(currentPath);

    allStrokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;

      // Get transformed points if stroke has transform, otherwise use raw points
      const points = stroke.transform
        ? TransformEngine.getTransformedPoints(stroke)
        : stroke.points;

      if (points.length < 2 && points.length !== 1) return;

      const isSelected = selectedStrokeId !== null && stroke.id === selectedStrokeId;
      const brushType = stroke.brushType || 'pen';
      const strokeColor = isSelected ? '#ffffff' : stroke.color;

      ctx.save();

      // Handle selection glow if selected
      if (isSelected) {
        ctx.shadowBlur = (stroke.glowIntensity || 15) * 2.5;
        ctx.shadowColor = '#ffffff';
      }

      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, stroke.lineWidth / 2, 0, 2 * Math.PI);
        ctx.fillStyle = strokeColor;
        ctx.fill();
        ctx.restore();
        return;
      }

      const scale = stroke.transform?.scale || 1;
      const baseWidth = stroke.lineWidth * scale;

      // --- Custom Brush Rendering ---
      switch (brushType) {
        case 'pencil': {
          ctx.strokeStyle = strokeColor;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            const pressure = p2.pressure !== undefined ? p2.pressure : 0.5;
            const w = baseWidth * (0.3 + pressure * 0.7) * 0.6;

            ctx.save();
            ctx.globalAlpha = isSelected ? 1.0 : 0.35 * (0.5 + pressure * 0.5);
            ctx.lineWidth = w;

            // Main stroke
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Parallel sketchy strokes
            ctx.lineWidth = w * 0.5;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              const nx = -dy / len;
              const ny = dx / len;

              ctx.globalAlpha = isSelected ? 0.5 : 0.15;
              ctx.beginPath();
              ctx.moveTo(p1.x + nx * w * 0.4, p1.y + ny * w * 0.4);
              ctx.lineTo(p2.x + nx * w * 0.4, p2.y + ny * w * 0.4);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(p1.x - nx * w * 0.3, p1.y - ny * w * 0.3);
              ctx.lineTo(p2.x - nx * w * 0.3, p2.y - ny * w * 0.3);
              ctx.stroke();
            }

            // Graphite dust particles (skip if selected for cleaner selection box)
            if (!isSelected) {
              ctx.fillStyle = strokeColor;
              ctx.globalAlpha = 0.25;
              const count = Math.ceil(len / 3);
              for (let k = 0; k < count; k++) {
                const t = k / count;
                const px = p1.x + dx * t + (Math.random() - 0.5) * w * 1.5;
                const py = p1.y + dy * t + (Math.random() - 0.5) * w * 1.5;
                ctx.fillRect(px, py, 1, 1);
              }
            }

            ctx.restore();
          }
          break;
        }

        case 'marker': {
          ctx.strokeStyle = strokeColor;
          ctx.lineCap = 'square';
          ctx.lineJoin = 'miter';
          ctx.save();
          ctx.globalAlpha = isSelected ? 1.0 : 0.45;

          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            ctx.lineWidth = baseWidth * 1.8;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }

        case 'calligraphy': {
          ctx.fillStyle = strokeColor;

          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            const pressure = p2.pressure !== undefined ? p2.pressure : 0.5;
            const w = baseWidth * (0.5 + pressure * 0.8) * 1.5;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.ceil(dist / 2);

            for (let s = 0; s <= steps; s++) {
              const t = steps > 0 ? s / steps : 0;
              const sx = p1.x + dx * t;
              const sy = p1.y + dy * t;

              ctx.save();
              ctx.translate(sx, sy);
              ctx.rotate(Math.PI / 4);
              ctx.fillRect(-w / 2, -w * 0.1, w, w * 0.2);
              ctx.restore();
            }
          }
          break;
        }

        case 'neon': {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Outer heavy glow
          ctx.save();
          ctx.shadowBlur = isSelected ? (stroke.glowIntensity || 20) * 2.5 : (stroke.glowIntensity || 20);
          ctx.shadowColor = isSelected ? '#ffffff' : stroke.color;
          ctx.strokeStyle = isSelected ? '#ffffff' : stroke.color;
          ctx.lineWidth = baseWidth;

          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();
          ctx.restore();

          // Inner bright core
          ctx.save();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = baseWidth * 0.35;
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();
          ctx.restore();
          break;
        }

        case 'watercolor': {
          ctx.fillStyle = strokeColor;
          ctx.save();

          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            const pressure = p2.pressure !== undefined ? p2.pressure : 0.5;
            const w = baseWidth * (0.8 + pressure * 0.8) * 2.5;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.ceil(dist / 4);

            for (let s = 0; s <= steps; s++) {
              const t = steps > 0 ? s / steps : 0;
              const sx = p1.x + dx * t;
              const sy = p1.y + dy * t;

              const grad = ctx.createRadialGradient(sx, sy, w * 0.1, sx, sy, w);
              grad.addColorStop(0, strokeColor);
              ctx.globalAlpha = isSelected ? 0.35 : 0.08 * (0.4 + pressure * 0.6);
              grad.addColorStop(0.7, strokeColor);
              grad.addColorStop(1, 'transparent');

              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(sx, sy, w, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
          ctx.restore();
          break;
        }

        case 'spray': {
          ctx.fillStyle = strokeColor;
          ctx.save();

          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            const velocity = p2.velocity || 0.1;
            const pressure = p2.pressure || 0.5;

            const radius = baseWidth * (1.5 + velocity * 2);
            const density = Math.max(3, Math.floor(25 - velocity * 4));

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.ceil(dist / 6);

            for (let s = 0; s <= steps; s++) {
              const t = steps > 0 ? s / steps : 0;
              const sx = p1.x + dx * t;
              const sy = p1.y + dy * t;

              for (let d = 0; d < density; d++) {
                const u1 = Math.random() || 0.0001;
                const u2 = Math.random() || 0.0001;
                const r = Math.sqrt(-2.0 * Math.log(u1)) * radius * 0.4;
                const theta = 2.0 * Math.PI * u2;
                const px = sx + r * Math.cos(theta);
                const py = sy + r * Math.sin(theta);

                const dotSize = Math.random() * 1.5 * (0.5 + pressure * 0.5) + 0.5;
                ctx.globalAlpha = isSelected ? 0.8 : Math.max(0.1, 1 - (r / radius));
                ctx.fillRect(px, py, dotSize, dotSize);
              }
            }
          }
          ctx.restore();
          break;
        }

        case 'pen':
        default: {
          ctx.strokeStyle = strokeColor;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            const pressure = p2.pressure !== undefined ? p2.pressure : 0.5;
            ctx.lineWidth = baseWidth * (0.4 + pressure * 0.8);

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
          break;
        }
      }

      ctx.shadowBlur = 0;

      // --- Visual Guides for Selected Stroke ---
      if (isSelected) {
        this._drawSelectionGuides(ctx, points, stroke, controlGesture);
      }

      ctx.restore();
    });
  }

  /**
   * Draw visual guides around a selected stroke.
   */
  _drawSelectionGuides(ctx, points, stroke, controlGesture) {
    // Calculate bounding box center
    let cx = 0, cy = 0;
    for (const p of points) { cx += p.x; cy += p.y; }
    cx /= points.length;
    cy /= points.length;

    // Calculate bounding radius
    let maxR = 0;
    for (const p of points) {
      const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      if (d > maxR) maxR = d;
    }
    const guideRadius = maxR + 20;

    ctx.save();

    // Dashed selection ring
    ctx.beginPath();
    ctx.arc(cx, cy, guideRadius, 0, 2 * Math.PI);
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Mode-specific guides
    if (controlGesture === 'CTRL_ROTATE') {
      // Rotation arc indicator
      const angle = stroke.transform?.rotation || 0;
      ctx.beginPath();
      ctx.arc(cx, cy, guideRadius + 8, -Math.PI / 2, -Math.PI / 2 + angle, angle < 0);
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Arrow at end
      const endAngle = -Math.PI / 2 + angle;
      const ax = cx + (guideRadius + 8) * Math.cos(endAngle);
      const ay = cy + (guideRadius + 8) * Math.sin(endAngle);
      ctx.beginPath();
      ctx.arc(ax, ay, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
      ctx.fill();
    } else if (controlGesture === 'CTRL_SCALE') {
      // Scale expansion rings
      const scale = stroke.transform?.scale || 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, guideRadius * (0.5 + i * 0.2), 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(0, 255, 200, ${0.15 * (4 - i)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Scale label
      ctx.fillStyle = 'rgba(0, 255, 200, 0.8)';
      ctx.font = '12px monospace';
      ctx.fillText(`${(scale * 100).toFixed(0)}%`, cx - 15, cy - guideRadius - 12);
    } else if (controlGesture === 'CTRL_MOVE') {
      // Move shadow
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(100, 180, 255, 0.6)';
      ctx.fill();
      // Crosshair
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12);
      ctx.strokeStyle = 'rgba(100, 180, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }

  saveAsImage() {
    return this.canvas.toDataURL('image/png');
  }
}
