import React, { useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

export const AuthPanel: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Lỗi đăng nhập:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Lỗi đăng xuất:', error);
    }
  };

  if (user) {
    return (
      <button 
        onClick={handleSignOut} 
        className="flex items-center justify-center text-[#D7CCC8] hover:text-white hover:bg-[#5D4037] p-2 rounded-full border border-[#5D4037] transition-colors" 
        title={`Đăng xuất (${user.displayName || user.email})`}
      >
        <LogOut size={13} />
      </button>
    );
  }

  return (
    <button 
      onClick={handleSignIn} 
      className="flex items-center justify-center text-[#D7CCC8] hover:text-white hover:bg-[#5D4037] p-2 rounded-full border border-[#5D4037] transition-colors" 
      title="Đăng nhập Google"
    >
      <LogIn size={13} />
    </button>
  );
};
