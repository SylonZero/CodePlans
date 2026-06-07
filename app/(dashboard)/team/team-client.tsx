'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MoreVertical,
  Mail,
  Shield,
  Users,
  Crown,
  UserPlus,
} from 'lucide-react'
import type { TeamMember, Organization, UserRole } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'
import { inviteMemberAction, changeMemberRoleAction, removeMemberAction } from '../actions'

const roleLabels: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

const roleDescriptions: Record<UserRole, string> = {
  owner: 'Full access, billing management',
  admin: 'Manage team, products, plans',
  editor: 'Create and edit content',
  viewer: 'View-only access',
}

const roleStyles: Record<UserRole, string> = {
  owner: 'bg-chart-3/20 text-chart-3',
  admin: 'bg-chart-2/20 text-chart-2',
  editor: 'bg-chart-1/20 text-chart-1',
  viewer: 'bg-muted text-muted-foreground',
}

interface Props {
  members: TeamMember[]
  organization: Organization
  currentUserId: string
}

function InviteDialog({ organization }: { organization: Organization }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<UserRole>('editor')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ tempPassword?: string; error?: string } | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('role', role)
    startTransition(async () => {
      const res = await inviteMemberAction(fd)
      setResult(res ?? null)
      if (!res?.error) {
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  function handleClose() {
    setOpen(false)
    setResult(null)
    setRole('editor')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Create an account and add them to {organization.name}.
          </DialogDescription>
        </DialogHeader>
        {result?.tempPassword ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Account created. Share these credentials with the new member — they should change their password after first login.
            </p>
            <div className="rounded-md bg-muted p-4 space-y-2 text-sm font-mono">
              <p>Temporary password: <span className="text-accent">{result.tempPassword}</span></p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full Name</Label>
              <Input id="invite-name" name="name" placeholder="Jane Smith" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address <span className="text-destructive">*</span></Label>
              <Input id="invite-email" name="email" type="email" placeholder="colleague@company.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{roleDescriptions[role]}</p>
            </div>
            {result?.error && <p className="text-sm text-destructive">{result.error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creating account…' : 'Create & Add'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MemberMenu({ member, currentUserId }: { member: TeamMember; currentUserId: string }) {
  const [isPending, startTransition] = useTransition()
  const [changeRoleOpen, setChangeRoleOpen] = useState(false)
  const [newRole, setNewRole] = useState<UserRole>(member.role)

  function handleChangeRole() {
    startTransition(async () => {
      await changeMemberRoleAction(member.userId, newRole)
      setChangeRoleOpen(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setChangeRoleOpen(true)}>Change Role</DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => e.preventDefault()}
              >
                Remove from Team
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {member.user.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  They will lose access to all products and plans in this organization.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isPending}
                  onClick={() => startTransition(() => removeMemberAction(member.userId))}
                >
                  {isPending ? 'Removing…' : 'Remove Member'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={changeRoleOpen} onOpenChange={setChangeRoleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>Update role for {member.user.name}.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>New Role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{roleDescriptions[newRole]}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeRoleOpen(false)}>Cancel</Button>
            <Button disabled={isPending || newRole === member.role} onClick={handleChangeRole}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function TeamClient({ members, organization, currentUserId }: Props) {
  const membersByRole = {
    owner: members.filter((m) => m.role === 'owner'),
    admin: members.filter((m) => m.role === 'admin'),
    editor: members.filter((m) => m.role === 'editor'),
    viewer: members.filter((m) => m.role === 'viewer'),
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground">Manage your team members and their permissions</p>
        </div>
        <InviteDialog organization={organization} />
      </div>

      {/* Organization Info */}
      <Card className="bg-card border-border mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{organization.name}</CardTitle>
              <CardDescription>{organization.memberCount} members</CardDescription>
            </div>
            <Badge variant="secondary" className="capitalize">
              {organization.billingTier} Plan
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Team Members</p>
                <p className="text-lg font-semibold">{members.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-lg font-semibold">
                  {membersByRole.owner.length + membersByRole.admin.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Invites</p>
                <p className="text-lg font-semibold">0</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Members Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base">Team Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isCurrentUser = member.userId === currentUserId

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback
                            className={cn(
                              'text-sm',
                              member.role === 'owner'
                                ? 'bg-chart-3/20 text-chart-3'
                                : 'bg-muted'
                            )}
                          >
                            {member.user.name.split(' ').map((n) => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{member.user.name}</p>
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-xs">You</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{member.user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {member.role === 'owner' && (
                          <Crown className="h-4 w-4 text-chart-3" />
                        )}
                        <Badge variant="secondary" className={cn('capitalize', roleStyles[member.role])}>
                          {roleLabels[member.role]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(member.joinedAt)}
                    </TableCell>
                    <TableCell>
                      {!isCurrentUser && member.role !== 'owner' && (
                        <MemberMenu member={member} currentUserId={currentUserId} />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
