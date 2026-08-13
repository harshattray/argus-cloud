import { redirect } from "next/navigation";

/**
 * The operator tree has one surface today. Rather than a landing page listing a
 * single link, `/admin` goes straight to it. When Pathway 5 adds the real
 * operator console this becomes its index.
 */
export default function AdminIndex() {
  redirect("/admin/waitlist");
}
