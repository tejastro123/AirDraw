/**
 * MathSolver: Parses handwriting OCR string, solves equations, and compiles LaTeX representation.
 */
export class MathSolver {
  /**
   * Evaluates and formats mathematical expression.
   * @param {string} rawText - Handwritten text from OCR scan (e.g. "2 + 2" or "integrate x^2")
   * @returns {Object} - { latex: string, solution: string, status: 'success'|'error' }
   */
  static solve(rawText) {
    if (!rawText) return { latex: '', solution: '', status: 'error' };

    // Clean OCR text for math compatibility
    let query = rawText
      .replace(/[\n\r]/g, ' ')
      .replace(/x²/g, 'x^2')
      .replace(/x³/g, 'x^3')
      .replace(/∫/g, 'integrate')
      .replace(/=/g, '==') // for algebraic equations
      .trim();

    // Check if user is asking to integrate
    const isIntegration = /integrate/i.test(query) || /int/i.test(query);
    const isDerivative = /derivative/i.test(query) || /diff/i.test(query);

    try {
      const math = window.math;
      if (!math) {
        throw new Error("Math.js library not loaded");
      }

      let latex = '';
      let solution = '';

      if (isIntegration) {
        // Form: integrate x^2 dx or similar
        const match = query.match(/(?:integrate|int)\s*(.*?)(?:\s*d[a-z])?$/i);
        const expr = match ? match[1].trim() : 'x^2';
        
        // Solve integration using symbolic rules
        const solved = this._symbolicIntegrate(expr);
        latex = `\\int ${math.parse(expr).toTex()} \\, dx`;
        solution = `${solved.tex} + C`;
      } 
      else if (isDerivative) {
        const match = query.match(/(?:derivative|diff)\s*(.*?)$/i);
        const expr = match ? match[1].trim() : 'x^2';
        
        const derivative = math.derivative(expr, 'x');
        latex = `\\frac{d}{dx}\\left(${math.parse(expr).toTex()}\\right)`;
        solution = derivative.toTex();
      }
      else {
        // Standard algebraic equation or evaluation
        // If it's a simple evaluation like "2+2", solve directly
        if (query.includes('==')) {
          // Equation: e.g., x^2 == 9
          const parts = query.split('==');
          const lhs = parts[0].trim();
          const rhs = parts[1].trim();

          const solved = this._solveEquation(lhs, rhs);
          latex = `${math.parse(lhs).toTex()} = ${math.parse(rhs).toTex()}`;
          solution = solved.tex;
        } else {
          // Basic evaluation
          const result = math.evaluate(query);
          latex = math.parse(query).toTex();
          
          if (typeof result === 'number') {
            solution = result.toLocaleString(undefined, { maximumFractionDigits: 4 });
          } else {
            solution = result.toString();
          }
        }
      }

      return {
        latex: `${latex} = ${solution}`,
        solution,
        status: 'success'
      };

    } catch (e) {
      console.warn("Math solve error:", e);
      return {
        latex: rawText,
        solution: 'Error solving math',
        status: 'error'
      };
    }
  }

  /**
   * Solves 1D equations like x^2 = 9 or 2x + 5 = 15.
   */
  static _solveEquation(lhsStr, rhsStr) {
    try {
      const math = window.math;
      // Bring rhs to lhs: lhs - rhs = 0
      const expr = `(${lhsStr}) - (${rhsStr})`;
      const node = math.parse(expr);
      
      // Heuristic solver for simple polynomials and linear equations
      // Try integers -10 to 10
      const roots = [];
      for (let x = -100; x <= 100; x++) {
        try {
          const val = node.evaluate({ x });
          if (Math.abs(val) < 0.0001) {
            roots.push(x);
          }
        } catch {}
      }

      if (roots.length > 0) {
        // Remove duplicates
        const uniqueRoots = [...new Set(roots)];
        return {
          roots: uniqueRoots,
          tex: `x \\in \\{${uniqueRoots.join(', ')}\\}`
        };
      }

      return { roots: [], tex: 'Could not solve algebraically' };
    } catch {
      return { roots: [], tex: 'Error solving' };
    }
  }

  /**
   * Helper symbolic integration for common monomials/polynomials.
   */
  static _symbolicIntegrate(exprStr) {
    const math = window.math;
    try {
      const node = math.parse(exprStr);
      
      // Handle single monomial x^n
      if (node.isSymbolNode && node.name === 'x') {
        return { tex: '\\frac{1}{2}x^2' };
      }
      
      if (node.isConstantNode) {
        const val = node.value;
        return { tex: `${val}x` };
      }

      // Handle power node like x^2
      if (node.isOperatorNode && node.op === '^') {
        const base = node.args[0];
        const exponent = node.args[1];
        if (base.isSymbolNode && base.name === 'x' && exponent.isConstantNode) {
          const n = exponent.value;
          return { tex: `\\frac{1}{${n + 1}}x^{${n + 1}}` };
        }
      }

      // Handle additions like x^2 + 5
      if (node.isOperatorNode && node.op === '+') {
        const term1 = this._symbolicIntegrate(node.args[0].toString());
        const term2 = this._symbolicIntegrate(node.args[1].toString());
        return { tex: `${term1.tex} + ${term2.tex}` };
      }

      return { tex: '\\text{Complexity limit exceeded}' };
    } catch {
      return { tex: '\\text{Could not integrate}' };
    }
  }
}
