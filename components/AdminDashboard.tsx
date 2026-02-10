'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, getDocs, addDoc, deleteDoc, doc, query, where, onSnapshot, orderBy, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
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
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyBugId, setReplyBugId] = useState<string | null>(null);
  const [replyStatus, setReplyStatus] = useState<BugReport['status'] | null>(null);
  const [adminReply, setAdminReply] = useState('');

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
      // Use setDoc with email as document ID (required by Firestore rules)
      // Use merge: true to avoid overwriting if document already exists
      await setDoc(doc(db, 'betaWhitelist', email), {
        email: email,
        addedAt: Date.now(),
        addedBy: user?.uid || 'unknown',
      }, { merge: true });
      
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
      // Add to whitelist - use email as document ID (required by Firestore rules)
      const emailLower = signup.email.toLowerCase();
      await setDoc(doc(db, 'betaWhitelist', emailLower), {
        email: emailLower,
        addedAt: Date.now(),
        addedBy: user?.uid || 'unknown',
      }, { merge: true });

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

  const handleUpdateBugStatus = async (bugId: string, newStatus: BugReport['status'], reply?: string) => {
    try {
      // Get the bug report data first to access userId and other info
      const bugReportRef = doc(db, 'bugReports', bugId);
      const bugReportDoc = await getDoc(bugReportRef);
      
      if (!bugReportDoc.exists()) {
        setError('Bug report not found');
        return;
      }

      const bugReportData = bugReportDoc.data() as BugReport;
      
      // Update bug report status
      await updateDoc(bugReportRef, {
        status: newStatus,
        ...(newStatus === 'resolved' || newStatus === 'closed' ? { resolvedAt: Date.now() } : {}),
        ...(reply ? { adminNotes: reply } : {}),
      });

      // Send notification to user when bug is resolved or closed
      if ((newStatus === 'resolved' || newStatus === 'closed') && bugReportData.userId) {
        try {
          const statusText = newStatus === 'resolved' ? 'resolved' : 'closed';
          let message = `Your feedback has been ${statusText}!`;
          
          if (reply && reply.trim()) {
            message = `Your feedback has been ${statusText}.\n\nAdmin reply: ${reply}`;
          } else {
            message += ' Thank you for helping us improve.';
          }

          const notificationData = {
            userId: bugReportData.userId,
            type: 'bugReport',
            title: `✅ Feedback ${statusText === 'resolved' ? 'Resolved' : 'Closed'}`,
            message: message,
            bugReportId: bugId,
            createdAt: Date.now(),
            read: false,
          };

          await addDoc(collection(db, 'notifications'), notificationData);
          console.log('✅ Notification sent to user for resolved bug report');
        } catch (notifError) {
          console.error('Error sending notification:', notifError);
          // Don't fail the whole operation if notification fails
        }
      }

      setSuccess(`Bug report ${newStatus}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error updating bug status:', err);
      setError(err.message || 'Failed to update bug status');
    }
  };

  const handleResolveWithReply = (bugId: string, status: 'resolved' | 'closed') => {
    setReplyBugId(bugId);
    setReplyStatus(status);
    setAdminReply('');
    setShowReplyModal(true);
  };

  const handleSubmitReply = async () => {
    if (!replyBugId || !replyStatus) return;
    
    await handleUpdateBugStatus(replyBugId, replyStatus, adminReply.trim() || undefined);
    setShowReplyModal(false);
    setReplyBugId(null);
    setReplyStatus(null);
    setAdminReply('');
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

  const handleDeleteUser = async (userId: string, userName: string, userEmail: string) => {
    // Prevent deleting own account
    if (userId === user?.uid) {
      setError('You cannot delete your own account');
      setTimeout(() => setError(''), 3000);
      return;
    }

    // Double confirmation for account deletion
    const confirmMessage = `⚠️ WARNING: This will permanently delete ${userName}'s account and ALL their data!\n\nThis includes:\n- All tasks\n- All comments\n- All notifications\n- All bug reports\n- Profile picture\n- Friend connections\n\nThis action CANNOT be undone!\n\nType "${userName}" to confirm:`;
    
    const userInput = prompt(confirmMessage);
    if (userInput !== userName) {
      if (userInput !== null) { // User didn't cancel, just typed wrong
        setError('Confirmation name does not match. Account deletion cancelled.');
        setTimeout(() => setError(''), 3000);
      }
      return;
    }

    // Final confirmation
    if (!confirm(`Are you absolutely sure you want to PERMANENTLY DELETE ${userName}'s account?\n\nThis action CANNOT be undone!`)) {
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const deleteUserAccount = httpsCallable(functions, 'deleteUserAccount');
      const result = await deleteUserAccount({ userId });
      
      setSuccess(`✅ ${userName}'s account has been permanently deleted`);
      setTimeout(() => setSuccess(''), 5000);
      
      // The user will be removed from the list automatically via the real-time listener
    } catch (err: any) {
      console.error('Error deleting user account:', err);
      const errorMessage = err.message || err.code || 'Failed to delete user account';
      setError(`Failed to delete account: ${errorMessage}`);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
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
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</th>
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
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleDeleteUser(userInfo.id, userInfo.displayName, userInfo.email)}
                            disabled={userInfo.id === user?.uid || userInfo.isAdmin}
                            className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            title={userInfo.id === user?.uid ? "Cannot delete your own account" : userInfo.isAdmin ? "Cannot delete admin accounts" : "Delete user account"}
                          >
                            <FaTrash size={10} /> Delete Account
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
      </div>

      {/* Admin Reply Modal */}
      {showReplyModal && replyBugId && replyStatus && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={() => {
              setShowReplyModal(false);
              setReplyBugId(null);
              setReplyStatus(null);
              setAdminReply('');
            }}
          />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 z-[101] max-w-md mx-auto max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {replyStatus === 'resolved' ? '✅ Resolve Feedback' : '🔒 Close Feedback'}
              </h3>
              <button
                onClick={() => {
                  setShowReplyModal(false);
                  setReplyBugId(null);
                  setReplyStatus(null);
                  setAdminReply('');
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
              >
                <FaTimes className="text-gray-500 dark:text-gray-400" size={18} />
              </button>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Add a reply to the user (optional). This will be included in the notification sent to them.
            </p>
            
            <textarea
              value={adminReply}
              onChange={(e) => setAdminReply(e.target.value)}
              placeholder="Type your reply here... (optional)"
              className="w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none mb-4"
              rows={4}
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowReplyModal(false);
                  setReplyBugId(null);
                  setReplyStatus(null);
                  setAdminReply('');
                }}
                className="flex-1 px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReply}
                className="flex-1 px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                {replyStatus === 'resolved' ? 'Resolve' : 'Close'}
              </button>
            </div>
          </div>
        </>
      )}

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
