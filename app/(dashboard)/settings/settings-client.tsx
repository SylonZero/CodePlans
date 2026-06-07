'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { User, Bell, Shield, Sparkles, Key, Upload } from 'lucide-react'
import type { UserRole, BillingTier } from '@/lib/types'
import { updateProfileAction, changePasswordAction, requestEmailChangeAction, cancelEmailChangeAction } from '../actions'

interface Props {
  user: {
    name: string
    email: string
    role: UserRole
    featureFlags: { alpha?: boolean; beta?: boolean; aiAssistance?: boolean }
  }
  org: {
    name: string
    memberCount: number
    billingTier: BillingTier
  }
  billingEnabled?: boolean
  pendingEmailChange?: { newEmail: string; expiresAt: string } | null
  emailJustVerified?: boolean
}

function ProfileTab({ user, org, billingEnabled, pendingEmailChange, emailJustVerified }: Props) {
  const [name, setName] = useState(user.name)
  const [newEmail, setNewEmail] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isEmailPending, startEmailTransition] = useTransition()
  const [isCancelPending, startCancelTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    emailJustVerified ? { type: 'success', text: 'Email address updated successfully.' } : null,
  )
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pendingChange, setPendingChange] = useState(pendingEmailChange ?? null)

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateProfileAction(fd)
      if (res?.error) {
        setMessage({ type: 'error', text: res.error })
      } else {
        setMessage({ type: 'success', text: 'Profile updated.' })
      }
    })
  }

  function handleEmailChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEmailMessage(null)
    const fd = new FormData(e.currentTarget)
    startEmailTransition(async () => {
      const res = await requestEmailChangeAction(fd)
      if (res?.error) {
        setEmailMessage({ type: 'error', text: res.error })
      } else if (res?.pending) {
        setPendingChange({ newEmail: res.newEmail, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        setNewEmail('')
        setEmailMessage({ type: 'success', text: `Verification email sent to ${res.newEmail}.` })
      }
    })
  }

  function handleCancelEmailChange() {
    startCancelTransition(async () => {
      await cancelEmailChangeAction()
      setPendingChange(null)
      setEmailMessage(null)
    })
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your name and profile picture</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-accent text-accent-foreground text-xl">
                {name.split(' ').map((n) => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Button variant="outline" size="sm" disabled>
                <Upload className="mr-2 h-4 w-4" />
                Upload Photo
              </Button>
              <p className="text-xs text-muted-foreground">Coming soon</p>
            </div>
          </div>

          <Separator />

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {message && (
              <p className={`text-sm ${message.type === 'error' ? 'text-destructive' : 'text-green-500'}`}>
                {message.text}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Email Address</CardTitle>
          <CardDescription>
            Changes require email verification. A link will be sent to the new address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current Email</Label>
            <Input value={user.email} disabled className="opacity-60" />
          </div>

          {pendingChange ? (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/10 px-4 py-3 space-y-3">
              <p className="text-sm text-orange-400">
                Verification pending — a link was sent to <strong>{pendingChange.newEmail}</strong>.
                Click the link in the email to confirm the change.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEmailChange}
                disabled={isCancelPending}
                className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
              >
                {isCancelPending ? 'Cancelling…' : 'Cancel Email Change'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleEmailChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newEmail">New Email Address</Label>
                <Input
                  id="newEmail"
                  name="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  required
                />
              </div>

              {emailMessage && (
                <p className={`text-sm ${emailMessage.type === 'error' ? 'text-destructive' : 'text-green-500'}`}>
                  {emailMessage.text}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" variant="outline" disabled={isEmailPending}>
                  {isEmailPending ? 'Sending…' : 'Send Verification Email'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Your organization details and membership</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{org.name}</p>
              <p className="text-sm text-muted-foreground">{org.memberCount} members</p>
            </div>
            <Badge variant="secondary" className="capitalize">{user.role}</Badge>
          </div>
          {billingEnabled && (
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div>
                <p className="text-sm font-medium">Billing Tier</p>
                <p className="text-sm text-muted-foreground capitalize">{org.billingTier} Plan</p>
              </div>
              <Button variant="outline" size="sm" disabled>Manage Billing</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SecurityTab() {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await changePasswordAction(fd)
      if (res?.error) {
        setMessage({ type: 'error', text: res.error })
      } else {
        setMessage({ type: 'success', text: 'Password updated successfully.' })
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input id="currentPassword" name="currentPassword" type="password" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input id="newPassword" name="newPassword" type="password" minLength={6} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" minLength={6} required />
              </div>
            </div>

            {message && (
              <p className={`text-sm ${message.type === 'error' ? 'text-destructive' : 'text-accent'}`}>
                {message.text}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Updating…' : 'Update Password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>Add an extra layer of security to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Key className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Authenticator App</p>
                <p className="text-sm text-muted-foreground">Not configured</p>
              </div>
            </div>
            <Button variant="outline" disabled>Setup <span className="ml-2 text-xs text-muted-foreground">(coming soon)</span></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function SettingsClient({ user, org, billingEnabled = true, pendingEmailChange, emailJustVerified }: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab
            user={user}
            org={org}
            billingEnabled={billingEnabled}
            pendingEmailChange={pendingEmailChange}
            emailJustVerified={emailJustVerified}
          />
        </TabsContent>

        {/* Notifications — local UI state only, no backend yet */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Configure when you receive email notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { title: 'Task Assignments', description: 'When you are assigned to a task', defaultChecked: true },
                { title: 'Plan Updates', description: 'When a code plan you follow is updated', defaultChecked: true },
                { title: 'Team Activity', description: 'When team members join or complete tasks', defaultChecked: false },
                { title: 'Weekly Digest', description: 'A summary of activity in your organization', defaultChecked: true },
                { title: 'Product Updates', description: 'News about CodePlans features and updates', defaultChecked: false },
              ].map((item) => (
                <div key={item.title} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch defaultChecked={item.defaultChecked} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features — local UI state only */}
        <TabsContent value="features" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>Opt in to beta features and experimental functionality</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">AI Assistance</p>
                    <Badge variant="secondary" className="text-xs bg-chart-1/20 text-chart-1">Beta</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Use AI to estimate effort and analyze tech debt</p>
                </div>
                <Switch defaultChecked={user.featureFlags.aiAssistance} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Beta Features</p>
                    <Badge variant="secondary" className="text-xs bg-chart-2/20 text-chart-2">Public Beta</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Access new features before general release</p>
                </div>
                <Switch defaultChecked={user.featureFlags.beta} />
              </div>
              <Separator />
              <div className="flex items-center justify-between opacity-50">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Alpha Features</p>
                    <Badge variant="secondary" className="text-xs">Invite Only</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Early access to experimental features</p>
                </div>
                <Switch disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
