import { useEffect } from "react";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import AIHumanSection from "@/components/AIHumanSection";
import IntelligentPanel from "@/components/IntelligentPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile();

  // Se estiver logado: após carregar perfil, ir ao onboarding (se não completou) ou ao dashboard
  useEffect(() => {
    if (authLoading || !user || profileLoading) return;
    setLocation(profile?.onboardingCompleted ? "/dashboard" : "/onboarding?new=1");
  }, [user, authLoading, profileLoading, profile?.onboardingCompleted, setLocation]);

  if (!authLoading && user && !profileLoading) {
    return null;
  }

  return (
    <div className="flex-1">
      <Header />
      <main id="main-content">
        <Hero />
        <HowItWorks />
        <AIHumanSection />
        <IntelligentPanel />
        <Pricing />
        <Testimonials />
      </main>
      <Footer />
    </div>
  );
}
