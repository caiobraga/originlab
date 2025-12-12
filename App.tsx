import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import ParaConsultorias from "./pages/ParaConsultorias";
import ParaFAPs from "./pages/ParaFAPs";
import ParaCorporativo from "./pages/ParaCorporativo";
import EditalDetails from "./pages/EditalDetails";
import MinhasPropostas from "./pages/MinhasPropostas";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Demo from "./pages/Demo";
import TrialBanner from "./components/TrialBanner";
import EmailRecommendation from "./components/EmailRecommendation";
import Referencia from "./pages/Referencia";
import AdminDashboard from "./pages/AdminDashboard";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/para-consultorias"} component={ParaConsultorias} />
      <Route path={"/para-faps"} component={ParaFAPs} />
      <Route path={"/para-corporativo"} component={ParaCorporativo} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/demo"} component={Demo} />
      <Route path={"/edital/:id"} component={EditalDetails} />
      <Route path={"/minhas-propostas"} component={MinhasPropostas} />
      <Route path={"/onboarding"} component={Onboarding} />
      <Route path={"/referencia"} component={Referencia} />
      <Route path={"/admin"} component={AdminDashboard} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const isUserInTrial = true;
  const daysRemaining = 5;
  const userEmail = "usuario@example.com";

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
      >
        <TooltipProvider>
          <Toaster />
          {isUserInTrial && <TrialBanner isTrialActive={true} daysRemaining={daysRemaining} />}
          <Router />
          <EmailRecommendation userEmail={userEmail} onboarded={true} />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
