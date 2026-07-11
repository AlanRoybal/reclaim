import { redirect } from "next/navigation";

// POC MODE: login disabled — everyone is the demo user.
export default function LoginPage() {
  redirect("/app");
}
