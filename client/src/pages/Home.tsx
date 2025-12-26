import { useEffect } from "react";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import DemoPanel from "@/components/DemoPanel";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import AIHumanSection from "@/components/AIHumanSection";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();

  // Redirecionar para dashboard se estiver logado
  useEffect(() => {
    if (!authLoading && user) {
      setLocation("/dashboard");
      return;
    }
  }, [user, authLoading, setLocation]);

  // Não renderizar conteúdo se estiver redirecionando
  if (!authLoading && user) {
    return null;
  }

  return (
    <div className="flex-1">
      <Header />
      <Hero />
      <HowItWorks />
      <AIHumanSection />
      <DemoPanel />
      <Pricing />
      <Testimonials />
      <Footer />
    </div>
  );
}
