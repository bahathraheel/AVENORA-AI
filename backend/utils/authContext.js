import { AsyncLocalStorage } from 'node:async_hooks';

const tokenStorage = new AsyncLocalStorage();

export function runWithUserToken(idToken, fn) {
  return tokenStorage.run(idToken || '', fn);
}

export function getCurrentUserToken() {
  return tokenStorage.getStore() || '';
}
