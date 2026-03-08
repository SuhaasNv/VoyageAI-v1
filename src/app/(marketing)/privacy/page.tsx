import { PageHero } from "@/ui/components/marketing/PageHero";
import { PageContent } from "@/ui/components/marketing/PageContent";

export const metadata = {
    title: "Privacy Policy | VoyageAI",
    description: "Privacy Policy for VoyageAI. Learn how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
    return (
        <>
            <PageHero
                title="Privacy Policy"
                subtitle="How we collect, use, and protect your data."
            />
            <PageContent>
                <p className="text-slate-500 text-sm">
                    Last updated: {new Date().toLocaleDateString("en-US")}
                </p>
                <div className="space-y-8 mt-8">
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">1. Information We Collect</h2>
                        <p>
                            We collect information you provide directly (e.g., email, name, password when you register), travel preferences and trip data you create, and usage data when you interact with the Service (e.g., pages visited, features used). We may also collect device and browser information for analytics and security.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">2. How We Use Your Information</h2>
                        <p>
                            We use your information to provide and improve the Service, personalize your experience (including AI-generated itineraries), communicate with you, enforce our terms, and comply with legal obligations. We do not sell your personal data to third parties.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">3. AI and Data Processing</h2>
                        <p>
                            Your trip data and preferences may be processed by AI models (e.g., Groq, Google Gemini) to generate itineraries and recommendations. We ensure that AI providers comply with our data processing agreements and use your data only for the purpose of providing the Service.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">4. Data Sharing</h2>
                        <p>
                            We may share data with service providers who assist us (e.g., hosting, analytics, email). We require these providers to protect your data and use it only for the purposes we specify. We may disclose data if required by law or to protect our rights and safety.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">5. Data Security</h2>
                        <p>
                            We implement industry-standard security measures including encryption, secure authentication, and access controls. Passwords are hashed; we never store plain-text passwords. We use httpOnly cookies for refresh tokens to reduce the risk of token theft.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">6. Your Rights</h2>
                        <p>
                            Depending on your location, you may have the right to access, correct, delete, or export your data. You can request account deletion at any time; we will remove your data and associated records in accordance with our retention policies. Contact us at privacy@voyageai.app for requests.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">7. Cookies</h2>
                        <p>
                            We use essential cookies for authentication and session management. We may use analytics cookies to understand how the Service is used. You can control cookie preferences through your browser settings.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">8. Changes</h2>
                        <p>
                            We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page and updating the &quot;Last updated&quot; date.
                        </p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold text-white mb-4">9. Contact</h2>
                        <p>
                            For privacy-related questions or requests, contact us at{" "}
                            <a href="mailto:privacy@voyageai.app" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                                privacy@voyageai.app
                            </a>
                            .
                        </p>
                    </section>
                </div>
            </PageContent>
        </>
    );
}
