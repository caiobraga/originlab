import Header from "@/components/Header";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import DemoPanel from "@/components/DemoPanel";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import AIHumanSection from "@/components/AIHumanSection";

export default function Home() {
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
