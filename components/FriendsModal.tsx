'use client';

import { useState } from 'react';
import { useFriends } from '@/hooks/useFriends';
import { useAuth } from '@/contexts/AuthContext';
import { FaTimes, FaUserPlus, FaTrash, FaCopy, FaQrcode, FaShare } from 'react-icons/fa';

interface FriendsModalProps {
  onClose: () => void;
}

export default function FriendsModal({ onClose }: FriendsModalProps) {
  const { userData } = useAuth();
  const { friends, searchUsers, searchByFriendCode, addFriend, removeFriend } = useFriends();
  const [searchInput, setSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'add' | 'mycode'>('mycode');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSearchResult(null);
    setSearching(true);

    try {
      let user = null;
      
      // Check if input looks like a friend code (6 alphanumeric chars)
      if (/^[A-Z0-9]{6}$/i.test(searchInput.trim())) {
        user = await searchByFriendCode(searchInput.trim());
      } else if (searchInput.includes('@')) {
        // Search by email
        user = await searchUsers(searchInput.trim());
      } else {
        setError('Please enter a valid email or friend code');
        setSearching(false);
        return;
      }

      if (user) {
        if (user.id === userData?.id) {
          setError("You can't add yourself as a friend!");
        } else if (userData?.friends.includes(user.id)) {
          setError('Already friends with this user');
        } else {
          setSearchResult(user);
        }
      } else {
        setError('User not found');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSearching(false);
    }
  };

  const handleAddFriend = async (friendId: string) => {
    setError('');
    setSuccess('');

    try {
      await addFriend(friendId);
      setSuccess('Friend added successfully!');
      setSearchInput('');
      setSearchResult(null);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!confirm('Are you sure you want to remove this friend?')) return;

    try {
      await removeFriend(friendId);
      setSuccess('Friend removed');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const copyFriendCode = () => {
    if (userData?.friendCode) {
      navigator.clipboard.writeText(userData.friendCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareProfile = async () => {
    const shareText = `Add me on Task Accountability! My friend code is: ${userData?.friendCode}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Add me on Task Accountability',
          text: shareText,
        });
      } catch (err) {
        // Fallback to copy
        navigator.clipboard.writeText(shareText);
        setSuccess('Copied to clipboard!');
      }
    } else {
      navigator.clipboard.writeText(shareText);
      setSuccess('Copied to clipboard!');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Friends</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FaTimes className="text-gray-600" size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('mycode')}
            className={`flex-1 py-3 font-medium transition-colors ${
              activeTab === 'mycode'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            My Code
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`flex-1 py-3 font-medium transition-colors ${
              activeTab === 'add'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Add Friend
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'mycode' ? (
            <>
              {/* My Friend Code Section */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Your Friend Code</h3>
                
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 text-center mb-4">
                  <p className="text-sm text-gray-600 mb-2">Share this code with friends</p>
                  <div className="text-4xl font-bold text-gray-900 tracking-wider mb-4" suppressHydrationWarning>
                    {userData?.friendCode || 'XXXXXX'}
                  </div>
                  
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={copyFriendCode}
                      className="flex items-center gap-2 bg-white text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors border border-gray-200"
                    >
                      <FaCopy size={16} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    
                    <button
                      onClick={shareProfile}
                      className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <FaShare size={16} />
                      Share
                    </button>
                  </div>
                </div>

                <p className="text-sm text-gray-500 text-center">
                  Friends can add you using this code - no email needed!
                </p>
              </div>

              {/* Friends List */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3" suppressHydrationWarning>
                  Your Friends ({friends.length})
                </h3>
                
                {friends.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No friends yet. Share your code to get started!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        className="bg-gray-50 rounded-lg p-3 flex items-center justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{friend.displayName}</p>
                          <p className="text-sm text-gray-500 truncate">{friend.friendCode}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveFriend(friend.id)}
                          className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors ml-2"
                          title="Remove friend"
                        >
                          <FaTrash size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Add Friend Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Add Friend</h3>
                
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg mb-3 text-sm">
                    {error}
                  </div>
                )}
                
                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg mb-3 text-sm">
                    {success}
                  </div>
                )}

                <form onSubmit={handleSearch} className="mb-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Friend code or email"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
                      required
                    />
                    <button
                      type="submit"
                      disabled={searching}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {searching ? 'Searching...' : 'Search'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Enter a 6-character friend code (e.g., ABC123) or email address
                  </p>
                </form>

                {searchResult && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{searchResult.displayName}</p>
                      <p className="text-sm text-gray-600">{searchResult.friendCode}</p>
                    </div>
                    <button
                      onClick={() => handleAddFriend(searchResult.id)}
                      className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition-colors"
                      title="Add friend"
                    >
                      <FaUserPlus size={16} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
