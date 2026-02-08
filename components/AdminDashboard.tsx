'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, getDocs, addDoc, deleteDoc, doc, query, where, onSnapshot, orderBy, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FaTimes, FaPlus, FaCheck, FaUser, FaEnvelope, FaCalendar, FaTrash, FaSpinner, FaBug, FaImage } from 'react-icons/fa';
import { BugReport } from '@/lib/types';

interface WhitelistEntry {
  id: string;
  email: string;
  addedAt?: number;
  addedBy?: string;
}

interface UserInfo {
  id: string;
  displayName: string;
  email: string;
  createdAt: number;
  isAdmin?: boolean;
}

interface PendingSignup {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

export default function AdminDashboard() {
  const { user, userData } = useAuth();
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [pendingSignups, setPendingSignups] = useState<PendingSignup[]>([]);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedBugImage, setSelectedBugImage] = useState<string | null>(null);

  // Check if user is admin
  const isAdmin = userData?.isAdmin === true;

  useEffect(() => {
    if (!isAdmin) return;

    // Listen to whitelist changes
    const whitelistRef = collection(db, 'betaWhitelist');
    const unsubscribeWhitelist = onSnapshot(
      query(whitelistRef, orderBy('email')),
      (snapshot) => {
        const entries: WhitelistEntry[] = [];
        snapshot.forEach((doc) => {
          entries.push({
            id: doc.id,
            ...doc.data(),
          } as WhitelistEntry);
        });
        setWhitelist(entries);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching whitelist:', err);
        setError('Failed to load whitelist');
        setLoading(false);
      }
    );

    // Listen to users collection
    const usersRef = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(
      query(usersRef, orderBy('createdAt', 'desc')),
      (snapshot) => {
        const users: UserInfo[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          users.push({
            id: doc.id,
            displayName: data.displayName || 'Unknown',
            email: data.email || '',
            createdAt: data.createdAt || 0,
            isAdmin: data.isAdmin || false,
          });
        });
        setAllUsers(users);
      },
      (err) => {
        console.error('Error fetching users:', err);
      }
    );

    // Listen to pending signups
    const pendingSignupsRef = collection(db, 'pendingSignups');
    const unsubscribePending = onSnapshot(
      query(pendingSignupsRef, where('status', '==', 'pending'), orderBy('requestedAt', 'desc')),
      (snapshot) => {
        const signups: PendingSignup[] = [];
        snapshot.forEach((doc) => {
          signups.push({
            id: doc.id,
            ...doc.data(),
          } as PendingSignup);
        });
        setPendingSignups(signups);
      },
      (err) => {
        console.error('Error fetching pending signups:', err);
      }
    );

    // Listen to bug reports
    const bugReportsRef = collection(db, 'bugReports');
    const unsubscribeBugReports = onSnapshot(
      query(bugReportsRef, orderBy('createdAt', 'desc')),
      (snapshot) => {
        const reports: BugReport[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          reports.push({
            id: doc.id,
            userId: data.userId,
            userName: data.userName,
            userEmail: data.userEmail,
            description: data.description,
            imageUrl: data.imageUrl,
            status: data.status,
            createdAt: data.createdAt?.toMillis?.() || data.createdAt || 0,
            resolvedAt: data.resolvedAt?.toMillis?.() || data.resolvedAt,
            adminNotes: data.adminNotes,
          });
        });
        setBugReports(reports);
      },
      (err) => {
        console.error('Error fetching bug reports:', err);
      }
    );

    return () => {
      unsubscribeWhitelist();
      unsubscribeUsers();
      unsubscribePending();
      unsubscribeBugReports();
    };
  }, [isAdmin]);

  const handleAddEmail = async () => {
    if (!newEmail.trim()) {
      setError('Please enter an email address');
      return;
    }

    const email = newEmail.trim().toLowerCase();
    
    // Check if already whitelisted
    if (whitelist.some(entry => entry.email === email)) {
      setError('This email is already whitelisted');
      return;
    }

    setAdding(true);
    setError('');
    setSuccess('');

    try {
      await addDoc(collection(db, 'betaWhitelist'), {
        email: email,
        addedAt: Date.now(),
        addedBy: user?.uid || 'unknown',
      });
      
      setNewEmail('');
      setSuccess(`Added ${email} to whitelist`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error adding to whitelist:', err);
      setError(err.message || 'Failed to add email');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveEmail = async (entryId: string, email: string) => {
    if (!confirm(`Remove ${email} from whitelist?`)) return;

    try {
      await deleteDoc(doc(db, 'betaWhitelist', entryId));
      setSuccess(`Removed ${email} from whitelist`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error removing from whitelist:', err);
      setError(err.message || 'Failed to remove email');
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleApproveSignup = async (signup: PendingSignup) => {
    try {
      // Add to whitelist
      await addDoc(collection(db, 'betaWhitelist'), {
        email: signup.email,
        addedAt: Date.now(),
        addedBy: user?.uid || 'unknown',
      });

      // Update pending signup status
      await updateDoc(doc(db, 'pendingSignups', signup.id), {
        status: 'approved',
        approvedAt: Date.now(),
        approvedBy: user?.uid || 'unknown',
      });

      // Create user document if it doesn't exist
      const userDocRef = doc(db, 'users', signup.userId);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let friendCode = '';
        for (let i = 0; i < 6; i++) {
          friendCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        await setDoc(userDocRef, {
          id: signup.userId,
          displayName: signup.displayName,
          email: signup.email,
          friendCode: friendCode,
          friends: [],
          createdAt: signup.requestedAt,
        });
      }

      setSuccess(`Approved ${signup.email}. They can now sign in!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error approving signup:', err);
      setError(err.message || 'Failed to approve signup');
    }
  };

  const handleRejectSignup = async (signup: PendingSignup) => {
    if (!confirm(`Reject signup request from ${signup.email}?`)) return;

    try {
      await updateDoc(doc(db, 'pendingSignups', signup.id), {
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectedBy: user?.uid || 'unknown',
      });

      setSuccess(`Rejected ${signup.email}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error rejecting signup:', err);
      setError(err.message || 'Failed to reject signup');
    }
  };

  const handleUpdateBugStatus = async (bugId: string, newStatus: BugReport['status']) => {
    try {
      await updateDoc(doc(db, 'bugReports', bugId), {
        status: newStatus,
        ...(newStatus === 'resolved' || newStatus === 'closed' ? { resolvedAt: Date.now() } : {}),
      });
      setSuccess(`Bug report ${newStatus}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error updating bug status:', err);
      setError(err.message || 'Failed to update bug status');
    }
  };

  const handleDeleteBugReport = async (bugId: string) => {
    if (!confirm('Are you sure you want to delete this bug report?')) return;
    try {
      await deleteDoc(doc(db, 'bugReports', bugId));
      setSuccess('Bug report deleted');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error deleting bug report:', err);
      setError(err.message || 'Failed to delete bug report');
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-400">
            You don't have admin privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            🔐 Admin Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage beta whitelist and view all users
          </p>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-4">
            {success}
          </div>
        )}

        {/* Add Email Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Add Email to Whitelist
          </h2>
          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
              placeholder="user@example.com"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white bg-white dark:bg-gray-700"
            />
            <button
              onClick={handleAddEmail}
              disabled={adding || !newEmail.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {adding ? <FaSpinner className="animate-spin" /> : <FaPlus />}
              Add
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
              {whitelist.length}
            </div>
            <div className="text-gray-600 dark:text-gray-400">Whitelisted Emails</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
              {allUsers.length}
            </div>
            <div className="text-gray-600 dark:text-gray-400">Total Users</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
              {allUsers.filter(u => whitelist.some(w => w.email === u.email.toLowerCase())).length}
            </div>
            <div className="text-gray-600 dark:text-gray-400">Active Users</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400 mb-1">
              {pendingSignups.length}
            </div>
            <div className="text-gray-600 dark:text-gray-400">Pending Requests</div>
          </div>
        </div>

        {/* Pending Signups */}
        {pendingSignups.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Pending Signup Requests ({pendingSignups.length})
            </h2>
            <div className="space-y-3">
              {pendingSignups.map((signup) => (
                <div
                  key={signup.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <FaUser className="text-gray-400" />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {signup.displayName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <FaEnvelope className="text-gray-400" />
                      <span>{signup.email}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Requested: {formatDate(signup.requestedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApproveSignup(signup)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
                    >
                      <FaCheck /> Approve
                    </button>
                    <button
                      onClick={() => handleRejectSignup(signup)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center gap-2"
                    >
                      <FaTimes /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Whitelist Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Whitelisted Emails ({whitelist.length})
          </h2>
          {loading ? (
            <div className="text-center py-8">
              <FaSpinner className="animate-spin text-3xl text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          ) : whitelist.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400 text-center py-8">
              No whitelisted emails yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Added</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {whitelist.map((entry) => {
                    const hasAccount = allUsers.some(u => u.email.toLowerCase() === entry.email);
                    return (
                      <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <FaEnvelope className="text-gray-400" />
                            <span className="text-gray-900 dark:text-white">{entry.email}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">
                          {entry.addedAt ? formatDate(entry.addedAt) : 'Unknown'}
                        </td>
                        <td className="py-3 px-4">
                          {hasAccount ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                              <FaCheck /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs font-medium">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleRemoveEmail(entry.id, entry.email)}
                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Remove from whitelist"
                          >
                            <FaTrash />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bug Reports Section */}
        {bugReports.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FaBug className="text-red-500" />
              Bug Reports ({bugReports.length})
            </h2>
            <div className="space-y-4">
              {bugReports.map((report) => (
                <div
                  key={report.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {report.userName}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({report.userEmail})
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            report.status === 'open'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : report.status === 'in-progress'
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-2">
                        {report.description}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(report.createdAt)}
                      </p>
                    </div>
                    {report.imageUrl && (
                      <button
                        onClick={() => setSelectedBugImage(report.imageUrl || null)}
                        className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                        title="View screenshot"
                      >
                        <img
                          src={report.imageUrl}
                          alt="Bug screenshot"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleUpdateBugStatus(report.id, 'in-progress')}
                      disabled={report.status === 'in-progress'}
                      className="px-3 py-1 text-xs bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Mark In Progress
                    </button>
                    <button
                      onClick={() => handleUpdateBugStatus(report.id, 'resolved')}
                      disabled={report.status === 'resolved' || report.status === 'closed'}
                      className="px-3 py-1 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Mark Resolved
                    </button>
                    <button
                      onClick={() => handleUpdateBugStatus(report.id, 'closed')}
                      disabled={report.status === 'closed'}
                      className="px-3 py-1 text-xs bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => handleDeleteBugReport(report.id)}
                      className="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1"
                    >
                      <FaTrash size={10} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            All Users ({allUsers.length})
          </h2>
          {allUsers.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400 text-center py-8">
              No users yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">User</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Joined</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((userInfo) => {
                    const isWhitelisted = whitelist.some(w => w.email === userInfo.email.toLowerCase());
                    return (
                      <tr key={userInfo.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                              {userInfo.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-gray-900 dark:text-white font-medium">
                                {userInfo.displayName}
                                {userInfo.isAdmin && (
                                  <span className="ml-2 text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full">
                                    Admin
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">
                          {userInfo.email}
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-sm">
                          {formatDate(userInfo.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          {isWhitelisted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                              <FaCheck /> Whitelisted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
                              Not Whitelisted
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bug Screenshot Lightbox */}
      {selectedBugImage && (
        <>
          <div
            className="fixed inset-0 bg-black/80 z-50 animate-in fade-in duration-200"
            onClick={() => setSelectedBugImage(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="relative max-w-4xl max-h-[90vh] pointer-events-auto">
              <button
                onClick={() => setSelectedBugImage(null)}
                className="absolute -top-12 right-0 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                title="Close"
              >
                <FaTimes size={24} />
              </button>
              <img
                src={selectedBugImage}
                alt="Bug screenshot"
                className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
