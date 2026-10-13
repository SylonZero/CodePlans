import { canEmailResetLinks } from '@/lib/auth/password-reset'
import { ForgotPasswordForm } from './forgot-password-form'

export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm canEmail={canEmailResetLinks()} />
}
