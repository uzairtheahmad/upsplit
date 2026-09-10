'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button, type ButtonProps } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { services } from '@/services'

/**
 * Signs the visitor in anonymously and drops them into their own seeded group.
 *
 * The workspace is built per visitor rather than shared, so exploring it — or
 * deleting everything in it — cannot affect anybody else's demo. That is also
 * why there is no reset job: there is nothing shared to reset.
 */
export function DemoButton({
  variant = 'outline',
  size = 'lg',
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'className'>) {
  const router = useRouter()
  const [loading, setLoading] = React.useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const supabase = createClient()

      // Reuse a session if there is one, so someone already signed in does not
      // get silently swapped into an anonymous account.
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }

      const groupId = await services.demo.start()
      router.replace(`/groups/${groupId}`)
      router.refresh()
    } catch (error) {
      setLoading(false)
      toast.error('Could not start the demo', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  return (
    <Button variant={variant} size={size} className={className} loading={loading} onClick={handleClick}>
      Try the demo, no signup
    </Button>
  )
}
