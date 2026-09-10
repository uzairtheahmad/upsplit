'use client'

import { MessageSquare, Send } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { useCurrentUserId, useUserMap } from '@/hooks/use-app-data'
import { relativeTime } from '@/lib/utils/dates'
import { services } from '@/services'
import type { ExpenseComment } from '@/types'

/** Matches the database's own limit, so the server never has to reject a post. */
const MAX_BODY = 2000

/**
 * The comment thread on an expense.
 *
 * Comments are fetched here rather than loaded with the workspace: a thread is
 * only ever read on one expense's page, so pulling every comment in every
 * group up front would cost far more than it saves.
 */
export function ExpenseComments({ expenseId }: { expenseId: string }) {
  const users = useUserMap()
  const currentUserId = useCurrentUserId()

  const [comments, setComments] = React.useState<ExpenseComment[] | null>(null)
  const [body, setBody] = React.useState('')
  const [posting, setPosting] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string>()

  React.useEffect(() => {
    let active = true

    services.comments
      .listForExpense(expenseId)
      .then((rows) => {
        if (active) setComments(rows)
      })
      .catch((error: unknown) => {
        if (!active) return
        setComments([])
        setLoadError(error instanceof Error ? error.message : 'Could not load comments')
      })

    return () => {
      active = false
    }
  }, [expenseId])

  const trimmed = body.trim()
  const tooLong = trimmed.length > MAX_BODY

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (trimmed.length === 0 || tooLong) return

    setPosting(true)
    try {
      const comment = await services.comments.add(expenseId, trimmed)
      setComments((current) => [...(current ?? []), comment])
      setBody('')
    } catch (error) {
      toast.error('Could not post that comment', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setPosting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
          Comments
          {comments && comments.length > 0 ? (
            <span className="text-sm font-normal text-muted-foreground">
              ({comments.length})
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {comments === null ? (
          <p className="py-2 text-sm text-muted-foreground" role="status">
            Loading comments…
          </p>
        ) : loadError ? (
          <p className="py-2 text-sm text-muted-foreground" role="status">
            {loadError}
          </p>
        ) : comments.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No comments yet. Ask about this expense if something looks off.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => {
              const author = users.get(comment.authorId)
              return (
                <li key={comment.id} className="flex gap-2.5">
                  {author ? (
                    <UserAvatar user={author} size="sm" />
                  ) : (
                    <span className="size-8 shrink-0 rounded-full bg-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-foreground">
                        {comment.authorId === currentUserId ? 'You' : author?.name ?? 'Someone'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {relativeTime(comment.createdAt)}
                      </span>
                    </p>
                    {/* Comments are plain text; whitespace-pre-line keeps the
                        author's line breaks without allowing any markup. */}
                    <p className="whitespace-pre-line break-words text-sm text-foreground">
                      {comment.body}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="space-y-2">
          <label htmlFor="comment-body" className="sr-only">
            Add a comment
          </label>
          <Textarea
            id="comment-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a comment…"
            rows={2}
            aria-invalid={tooLong || undefined}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {tooLong ? `${trimmed.length - MAX_BODY} characters too long` : null}
            </p>
            <Button type="submit" size="sm" loading={posting} disabled={!trimmed || tooLong}>
              <Send aria-hidden />
              Post
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
