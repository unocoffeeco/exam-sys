import { collection, getDocs } from "firebase/firestore";
import { getClientFirestore } from "@/lib/firebase-client";

export type UserRecord = {
  uid: string;
  name: string;
  email: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  classroomId: string;
  disabled: boolean;
};

/** One query for the whole directory (admin only, via Rules). */
export async function listUsers(): Promise<UserRecord[]> {
  const snap = await getDocs(collection(getClientFirestore(), "users"));
  return snap.docs
    .map((d) => ({
      uid: d.id,
      name: String(d.get("name") ?? ""),
      email: String(d.get("email") ?? ""),
      role: d.get("role") as UserRecord["role"],
      classroomId: String(d.get("classroomId") ?? ""),
      disabled: Boolean(d.get("disabled")),
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.classroomId.localeCompare(b.classroomId, "th") || a.name.localeCompare(b.name, "th"));
}
