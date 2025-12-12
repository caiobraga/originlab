import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import EditalDetails from "./pages/EditalDetails";
import MinhasPropostas from "./pages/MinhasPropostas";
import Dashboard from "./pages/Dashboard";
import Demo from "./pages/Demo";
import Profile from "./pages/Profile";
import EditProfile from "./pages/EditProfile";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/cadastro"} component={SignUp} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/perfil"} component={Profile} />
      <Route path={"/perfil/editar"} component={EditProfile} />
      <Route path={"/demo"} component={Demo} />
      <Route path={"/edital/:id"} component={EditalDetails} />
      <Route path={"/minhas-propostas"} component={MinhasPropostas} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider
          defaultTheme="light"
          // switchable
        >
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
