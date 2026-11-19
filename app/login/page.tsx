import { redirect } from "next/navigation";

// Login was removed — there is nothing to sign into. Anyone who lands on /login
// (e.g. an old bookmark) is sent straight to the app.
export default function LoginPage() {
  redirect("/");
}
