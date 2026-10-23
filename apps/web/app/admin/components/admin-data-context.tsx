"use client";
import { createContext, useContext } from "react";
import { adminApiFetch } from "../admin-api";
/** Preview injects an in-memory reader; authenticated pages use the original API. */
export const AdminDataContext = createContext<{ request: typeof adminApiFetch; preview: boolean }>({
  request: adminApiFetch,
  preview: false,
});
export const useAdminRequest = () => useContext(AdminDataContext).request;
export const useAdminPreview = () => useContext(AdminDataContext).preview;
export function useAdminHref() {
  const preview = useAdminPreview();
  return (href: string) => (preview ? href.replace(/^\/admin(?=\/|$)/, "/admin-preview") : href);
}
