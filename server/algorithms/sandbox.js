import { createContext, runInContext } from 'vm';

/**
 * Execute a generated trace function in a sandboxed VM context.
 * No access to require, process, fs, etc.
 */
export function executeTraceInSandbox(functionCode, input, timeoutMs = 5000) {
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math,
    Array,
    Object,
    Map,
    Set,
    JSON,
    Infinity,
    NaN,
    undefined,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Number,
    String,
    Boolean,
  };

  const wrappedCode = functionCode.startsWith('function')
    ? `const run = ${functionCode};\nrun(input);`
    : `const run = function run(input) { ${functionCode} };\nrun(input);`;

  const context = createContext({ ...sandbox, input });
  const trace = runInContext(wrappedCode, context, { timeout: timeoutMs });

  // Validate trace structure
  if (!Array.isArray(trace)) throw new Error('Trace generator did not return an array');
  for (const step of trace) {
    if (!step.type || !step.description) {
      throw new Error('Trace step missing required fields: type, description');
    }
  }

  return trace;
}
