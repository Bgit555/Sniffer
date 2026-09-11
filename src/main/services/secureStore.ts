import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { appDirs } from './appPaths'

/**
 * OS-level encrypted secret storage.
 *
 * On Windows `safeStorage` is backed by DPAPI (the same OS encryption behind
 * Credential Manager), so secrets are encrypted at rest with the user's account
 * and never written in plaintext. The API key is never exposed to the renderer.
 */

interface SecretFile {
  [key: string]: string // base64 encrypted blob
}

function secretFile(): string {
  return join(appDirs().root, 'secrets.enc')
}

function readAll(): SecretFile {
  const file = secretFile()
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    return typeof parsed === 'object' && parsed !== null ? (parsed as SecretFile) : {}
  } catch {
    return {}
  }
}

function writeAll(secrets: SecretFile): void {
  const file = secretFile()
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(secrets), 'utf-8')
  renameSync(tmp, file)
}

export function isSecureStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function setSecret(name: string, value: string): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const secrets = readAll()
  secrets[name] = safeStorage.encryptString(value).toString('base64')
  writeAll(secrets)
  return true
}

export function getSecret(name: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const blob = readAll()[name]
  if (!blob) return null
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'))
  } catch {
    return null
  }
}

export function hasSecret(name: string): boolean {
  return getSecret(name) !== null
}

export function deleteSecret(name: string): void {
  const secrets = readAll()
  if (name in secrets) {
    delete secrets[name]
    writeAll(secrets)
  }
}
