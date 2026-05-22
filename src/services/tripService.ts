import { supabase } from '../lib/supabase';
import type { Trip, TripInsert } from './tripHelpers';

export type CreateTripInput = {
  name: string;
  destinations: string[];
  startDate: string | null; // YYYY-MM-DD or null
  endDate: string | null;
};

export async function createTrip(userId: string, input: CreateTripInput): Promise<Trip> {
  const row: TripInsert = {
    user_id: userId,
    name: input.name,
    destinations: input.destinations,
    start_date: input.startDate,
    end_date: input.endDate,
    status: 'active',
  };

  const { data, error } = await supabase
    .from('trips')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data as Trip;
}

export async function listTrips(userId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Trip[];
}

export async function getTripById(id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data as Trip | null);
}

export async function endTrip(id: string): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .update({ status: 'completed' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Trip;
}

export async function deleteTrip(id: string): Promise<void> {
  const { error } = await supabase.from('trips').delete().eq('id', id);
  if (error) throw error;
}
