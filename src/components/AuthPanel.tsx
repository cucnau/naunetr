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
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[#D7CCC8]">{user.displayName || user.email}</span>
        <button onClick={handleSignOut} className="flex items-center gap-1.5 text-[10px] font-medium text-[#D7CCC8] hover:text-white hover:bg-[#5D4037] px-2 py-1 rounded-full border border-[#5D4037] transition-colors" title="Đăng xuất">
          <LogOut size={12} />
          <span>Đăng xuất</span>
        </button>
      </div>
    );
  }

  return (
    <button onClick={handleSignIn} className="flex items-center gap-1.5 text-[10px] font-medium text-[#D7CCC8] hover:text-white hover:bg-[#5D4037] px-2 py-1 rounded-full border border-[#5D4037] transition-colors">
      <LogIn size={12} />
      <span>Đăng nhập</span>
    </button>
  );
};
