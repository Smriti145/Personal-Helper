import * as Keychain from 'react-native-keychain';
import {SERVER_URL} from './config';
import { Platform } from 'react-native';
import type { State } from '../../shared/routine';
export const API_URL = (
  SERVER_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000')
).replace(/\/$/, '');
const TOKEN = 'saha.session.v1';
let token: string | null = null;
export async function restoreSession() {
  const stored=await Keychain.getGenericPassword({service:TOKEN});
  token=stored?stored.password:null;
  return !!token;
}
async function request(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(API_URL + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Saha-Client': 'native',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Unable to reach your account.');
  return data;
}
export async function signIn(
  email: string,
  password: string,
  register: boolean,
) {
  const result = await request(
    '/api/auth/' + (register ? 'register' : 'login'),
    'POST',
    { email, password },
  );
  if (!result.token)
    throw Error('Update the account server to support the mobile app.');
  token = result.token;
  await Keychain.setGenericPassword('session',token!,{service:TOKEN,accessible:Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
}
export const load = () =>
  request('/api/routine') as Promise<{ state: State | null; revision: number }>;
export const save = (state: State, revision: number) =>
  request('/api/routine', 'PUT', { state, revision }) as Promise<{
    revision: number;
  }>;
export async function signOut() {
  await request('/api/auth/logout', 'POST', {});
  token = null;
  await Keychain.resetGenericPassword({service:TOKEN});
}
export async function deleteAccount(password: string) {
  await request('/api/auth/delete', 'POST', { password });
  token = null;
  await Keychain.resetGenericPassword({service:TOKEN});
}
