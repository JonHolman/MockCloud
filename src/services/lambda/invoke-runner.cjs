const { randomUUID } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, extname, join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

function send(message) {
  if (typeof process.send === 'function') {
    process.send(message, () => {
      process.disconnect?.();
    });
  } else {
    process.exit(1);
  }
}

function toError(err) {
  if (err instanceof Error) {
    return err;
  }
  if (typeof err === 'string') {
    return new Error(err);
  }
  return new Error(String(err));
}

function toErrorOutcome(err) {
  const error = toError(err);
  return {
    error: {
      errorType: error.constructor.name,
      errorMessage: error.message,
      trace: (error.stack ?? '').split('\n'),
    },
  };
}

function sendOutcome(outcome, waitForEmptyEventLoop = false) {
  send({
    outcome,
    waitForEmptyEventLoop,
  });
}

function invokeHandler(handlerFn, payload) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;
    let context;

    const finish = (outcome) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        outcome,
        waitForEmptyEventLoop: context.callbackWaitsForEmptyEventLoop !== false,
      });
    };

    const complete = (err, result) => {
      if (err !== null && err !== undefined) {
        finish(toErrorOutcome(err));
        return;
      }
      finish({ result });
    };

    const deadline = startedAt + payload.timeout * 1000;
    context = {
      functionName: payload.functionName,
      functionVersion: '$LATEST',
      invokedFunctionArn: payload.functionArn,
      memoryLimitInMB: String(payload.memorySize),
      awsRequestId: randomUUID(),
      logGroupName: `/aws/lambda/${payload.functionName}`,
      logStreamName: `2024/01/01/[$LATEST]${randomUUID().replace(/-/g, '')}`,
      getRemainingTimeInMillis: () => Math.max(0, deadline - Date.now()),
      callbackWaitsForEmptyEventLoop: true,
      done: (err, result) => complete(err, result),
      fail: (err) => complete(err, undefined),
      succeed: (result) => complete(null, result),
    };
    const callback = (err, result) => complete(err, result);

    let returnValue;
    try {
      returnValue = handlerFn(payload.event, context, callback);
    } catch (err) {
      complete(err, undefined);
      return;
    }

    if (returnValue && typeof returnValue.then === 'function') {
      returnValue.then(
        (result) => complete(null, result),
        (err) => complete(err, undefined),
      );
      return;
    }

    if (returnValue !== undefined) {
      complete(null, returnValue);
    }
  });
}

process.once('message', async (payload) => {
  try {
    const Module = require('node:module');
    Module._initPaths();

    const lastDot = payload.handler.lastIndexOf('.');
    const modulePath = payload.handler.substring(0, lastDot);
    const exportedFunction = payload.handler.substring(lastDot + 1);
    const mod = await loadHandlerModule(payload.tempDir, modulePath);
    const handlerFn = mod[exportedFunction];

    if (typeof handlerFn !== 'function') {
      sendOutcome({
        error: {
          errorType: 'Runtime.HandlerNotFound',
          errorMessage: `${exportedFunction} is not a function in module ${modulePath}`,
          trace: [],
        },
      });
      return;
    }

    const message = await invokeHandler(handlerFn, payload);
    send(message);
  } catch (err) {
    sendOutcome(toErrorOutcome(err));
  }
});

function resolveHandlerFile(tempDir, modulePath) {
  const handlerBase = resolve(tempDir, modulePath);
  const candidates = extname(handlerBase)
    ? [handlerBase]
    : [
        handlerBase,
        `${handlerBase}.js`,
        `${handlerBase}.mjs`,
        `${handlerBase}.cjs`,
        join(handlerBase, 'index.js'),
        join(handlerBase, 'index.mjs'),
        join(handlerBase, 'index.cjs'),
      ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Cannot find module './${modulePath}'`);
}

function nearestPackageType(filePath, rootDir) {
  let currentDir = dirname(filePath);
  const resolvedRoot = resolve(rootDir);

  while (currentDir.startsWith(resolvedRoot)) {
    const packageJsonPath = join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        return parsed.type === 'module' ? 'module' : 'commonjs';
      } catch {
        return 'commonjs';
      }
    }

    if (currentDir === resolvedRoot) break;
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return 'commonjs';
}

async function loadHandlerModule(tempDir, modulePath) {
  const req = createRequire(join(tempDir, 'noop.js'));
  const resolvedPath = resolveHandlerFile(tempDir, modulePath);
  const extension = extname(resolvedPath);
  const useImport =
    extension === '.mjs' ||
    (extension === '.js' && nearestPackageType(resolvedPath, tempDir) === 'module');

  if (useImport) {
    return import(pathToFileURL(resolvedPath).href);
  }

  try {
    return req(resolvedPath);
  } catch (error) {
    if (error && error.code === 'ERR_REQUIRE_ESM') {
      return import(pathToFileURL(resolvedPath).href);
    }
    throw error;
  }
}
