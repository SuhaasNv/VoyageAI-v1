import { redirect } from "next/navigation";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import AdminNav from "./_nav";

export const metadata = { title: "Admin — VoyageAI" };

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    let email: string;
    try {
        const payload = await requireAdmin();
        email = payload.email;
    } catch (err) {
        if (err instanceof AdminAuthError && err.code === "FORBIDDEN") {
            redirect("/dashboard");
        }
        redirect("/login");
    }

    return (
        <div className="flex h-screen bg-[#080C11] text-white overflow-hidden">
            <AdminNav email={email!} />
            <main className="flex-1 min-w-0 overflow-y-auto">
                {children}
            </main>
        </div>
    );
}
