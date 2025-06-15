import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ApiService } from '../services/api';
import toast from 'react-hot-toast';

interface User {
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
  loginAsDemo: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = ApiService.getToken();
    if (token) {
      // For demo purposes, set a default user when token exists
      setUser({ email: 'demo@snipx.com', firstName: 'Demo', lastName: 'User' });
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await ApiService.login(email, password);
      setUser(response.user);
      toast.success('Login successful!');
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => {
    await ApiService.register(data);
  };

  const logout = () => {
    ApiService.clearToken();
    setUser(null);
    toast.success('Logged out successfully');
  };

  // Demo login function for testing without backend
  const loginAsDemo = () => {
    const demoToken = 'demo-token-' + Date.now();
    ApiService.setToken(demoToken);
    setUser({ 
      email: 'demo@snipx.com', 
      firstName: 'Demo', 
      lastName: 'User' 
    });
    toast.success('Logged in as demo user!');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        setUser,
        loginAsDemo
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}