import type { NextRequest, NextResponse } from 'next/server'

export interface AuthUser {
  id: string
  email: string
}

export interface AuthAdapter {
  getUser(): Promise<AuthUser | null>
  signIn(email: string, password: string): Promise<{ error?: string }>
  signUp(email: string, password: string, name: string): Promise<{ error?: string }>
  signOut(): Promise<never>
  refreshSession(request: NextRequest): Promise<NextResponse>
  adminCreateUser(email: string, password: string, name: string): Promise<string>
}
