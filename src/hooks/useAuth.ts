import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { linkAnonymousSessions } from "../store.remote";

export function useAuth(){
  const [user,setUser]=useState<import("@supabase/supabase-js").User|null>(null);
  const [loading,setLoading]=useState(true);
  const linked = useRef(false);

  useEffect(()=>{
    const s = supabase.auth.onAuthStateChange((_e,session)=>{ setUser(session?.user ?? null); setLoading(false); });
    supabase.auth.getSession().then(({data})=>{ setUser(data.session?.user ?? null); setLoading(false); });
    return () => s.data.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if (!user) { linked.current = false; return; }
    if (linked.current) return;
    linked.current = true;
    linkAnonymousSessions().catch(()=>{ linked.current = false; });
  },[user?.id]);

  return { user, loading };
}

export async function signInEmail(email:string){
  await supabase.auth.signInWithOtp({ email, options:{emailRedirectTo: window.location.origin} });
}
export async function signOut(){ await supabase.auth.signOut(); }

export async function signInPassword(email: string, password: string){
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpPassword(email: string, password: string){
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInWithGoogle(redirectPath?: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let redirectTo = origin;
  if (origin && redirectPath) {
    try {
      const resolved = new URL(redirectPath, origin);
      if (resolved.origin === origin) {
        redirectTo = resolved.toString();
      }
    } catch (_err) {
      redirectTo = origin;
    }
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: origin
      ? {
          redirectTo,
        }
      : undefined,
  });
  if (error) throw error;
  if (data?.url) {
    window.location.href = data.url;
  }
}
