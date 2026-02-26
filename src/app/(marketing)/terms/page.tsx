import { PageHero } from "@/components/marketing/PageHero";
import { PageContent } from "@/components/marketing/PageContent";

export const metadata = {
    title: "Terms of Service | VoyageAI",
    description: "Terms of Service for VoyageAI. Please read these terms before using our service.",
};

export default function TermsPage() {
    return (
        <>
            <PageHero
                title="Terms of Service"
                subtitle="Please read these terms before using VoyageAI."
            />
            <PageContent>
                <p className="text-slate-500 text-sm">
                    Last updated: {new Date().toLocaleDateString("en-US")}
                </p>
                <div className="space-y-8 mt-8">
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using VoyageAI (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">2. Description of Service</h2>
                        <p>
                            VoyageAI provides AI-powered travel planning tools, including itinerary generation, chat assistance, budget tracking, and map visualization. We reserve the right to modify, suspend, or discontinue any part of the Service at any time.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">3. User Accounts</h2>
                        <p>
                            You must create an account to use certain features. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to provide accurate and complete information when registering.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">4. Acceptable Use</h2>
                        <p>
                            You agree not to use the Service for any unlawful purpose or in any way that could damage, disable, or impair the Service. You may not attempt to gain unauthorized access to our systems or other users&apos; accounts. You may not use the Service to generate content that is illegal, harmful, or offensive.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">5. Intellectual Property</h2>
                        <p>
                            The Service and its content, features, and functionality are owned by VoyageAI and are protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works without our express written permission.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">6. Disclaimer of Warranties</h2>
                        <p>
                            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind. We do not guarantee that the Service will be uninterrupted, error-free, or that AI-generated content will be accurate or suitable for your travel needs. Always verify travel information independently.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">7. Limitation of Liability</h2>
                        <p>
                            To the maximum extent permitted by law, VoyageAI shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">8. Changes</h2>
                        <p>
                            We may update these Terms from time to time. We will notify you of material changes by posting the new Terms on this page and updating the &quot;Last updated&quot; date. Your continued use of the Service after such changes constitutes acceptance of the new Terms.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">9. Contact</h2>
                        <p>
                            For questions about these Terms, please contact us at{" "}
                            <a href="mailto:legal@voyageai.app" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                                legal@voyageai.app
                            </a>
                            .
                        </p>
                    </section>
                </div>
            </PageContent>
        </>
    );
}
