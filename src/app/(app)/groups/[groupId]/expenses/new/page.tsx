'use client'

import { useParams, useRouter } from 'next/navigation'

import { ExpenseForm } from '@/components/expenses/form/expense-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useGroup } from '@/hooks/use-app-data'

/**
 * Full-page expense creation.
 *
 * Same component as the dialog — a dedicated route exists so the form can be
 * linked to, bookmarked and used comfortably on a phone, where a modal with
 * this many controls would be cramped.
 */
export default function NewExpensePage() {
  const { groupId } = useParams<{ groupId: string }>()
  const router = useRouter()
  const group = useGroup(groupId)

  if (!group) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add an expense to {group.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <ExpenseForm
          groupId={groupId}
          onSuccess={() => router.push(`/groups/${groupId}/expenses`)}
          onCancel={() => router.back()}
          layout="split"
        />
      </CardContent>
    </Card>
  )
}
