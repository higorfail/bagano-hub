import { createClient } from './supabase'

export async function getClients() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'active')
    .order('name')
  if (error) throw error
  return data
}

export async function getClient(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*, client_assignments(*, team_members(*))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getPosts(clientId: string, month: number, year: number) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('posts')
    .select('*, assigned_to:team_members!posts_assigned_to_fkey(*)')
    .eq('client_id', clientId)
    .order('number')
  if (error) throw error
  return data
}

export async function getPost(postId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('posts')
    .select('*, assigned_to:team_members!posts_assigned_to_fkey(*), post_comments(*)')
    .eq('id', postId)
    .single()
  if (error) throw error
  return data
}

export async function updatePostStatus(postId: string, status: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('posts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', postId)
  if (error) throw error
}

export async function addComment(postId: string, content: string, authorName: string, authorType: 'internal' | 'client') {
  const supabase = createClient()
  const { error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, content, author_name: authorName, author_type: authorType })
  if (error) throw error
}