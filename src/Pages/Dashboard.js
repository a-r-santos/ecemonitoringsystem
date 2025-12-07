import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../API/supabaseClient';
import toast, { Toaster } from 'react-hot-toast';
import logo from '../Images/logo.png';
import '../CSS/Dashboard.css';

// Helper function to extract the storage path from the public URL
const getFilePathFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/public/avatars/');
  return parts.length > 1 ? `avatars/${parts[1].split('?')[0]}` : null;
};

function Dashboard() {
  const navigate = useNavigate();

  // States
  const [user, setUser] = useState(null);
  const [instructor, setInstructor] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeStatus, setActiveStatus] = useState('in_office');

  // UPDATED STATES for remarks
  const [remarks, setRemarks] = useState('');
  const [isRemarksSaving, setIsRemarksSaving] = useState(false);
  const [isRemarksEditing, setIsRemarksEditing] = useState(false); // NEW STATE for edit/save mode

  // --- Image Upload States ---
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploading, setUploading] = useState(false);

  // 1. AUTH & DATA FETCHING
  useEffect(() => {
    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/instructor");
    });

    return () => listener?.subscription?.unsubscribe?.();
  }, [navigate]);

  // Realtime listener
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("appointments-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        fetchAppointments(user.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function checkUser() {
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user) {
      navigate("/instructor");
      return;
    }
    setUser(user);

    const { data: instrData, error } = await supabase
      .from("instructors")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !instrData) {
      console.error("Error fetching instructor data:", error || "No instructor found.");
      await supabase.auth.signOut();
      navigate("/instructor");
      return;
    }

    setInstructor(instrData);
    setActiveStatus(instrData.availability || "in_office");
    // Initialize remarks state from DB
    setRemarks(instrData.remarks || "");

    // Set the avatar URL only if a profile_image_url exists in the DB
    if (instrData.profile_image_url) {
      const urlWithCacheBuster = `${instrData.profile_image_url}?t=${Date.now()}`;
      setAvatarUrl(urlWithCacheBuster);
    }

    if (instrData.verified) {
      fetchAppointments(user.id);
    }
  }

  async function fetchAppointments(instructorId) {
    const { data, error } = await supabase
      .from("appointments")
      .select(`*`)
      .eq("instructor_id", instructorId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching appointments:", error);
      toast.error("Error loading appointments.");
    }
    setAppointments(data || []);
  }

  // UPDATED: Function to save remarks to DB
  const saveRemarksToDB = async () => {
    if (!instructor) return;
    if (isRemarksSaving) return;

    setIsRemarksEditing(false); // Exit editing mode
    setIsRemarksSaving(true);

    const { error } = await supabase
      .from("instructors")
      .update({ remarks: remarks.trim() })
      .eq("id", instructor.id);

    setIsRemarksSaving(false);

    if (error) {
      console.error("Error updating remarks:", error);
      toast.error("Failed to save remarks.");
      // OPTIONAL: Revert remarks state to the last saved state or instructor.remarks
    } else {
      toast.success("Remarks saved!");
    }
  }

  // NEW: Function to toggle editing mode
  const startEditRemarks = () => {
    setIsRemarksEditing(true);
  };


  // NEW: Function to delete the old image file
  async function deleteOldAvatar(oldUrl) {
    if (!oldUrl) return;

    // Extract the path relative to the bucket (e.g., 'avatars/userId_timestamp.ext')
    const oldFilePath = getFilePathFromUrl(oldUrl);

    if (!oldFilePath) return;

    // The path needs to be relative to the bucket. Supabase Storage delete API requires
    // the path *inside* the bucket (e.g., 'userId_timestamp.ext').
    const pathToDelete = oldFilePath.replace('avatars/', '');

    const { error: deleteError } = await supabase.storage
      .from('avatars')
      .remove([pathToDelete]);

    if (deleteError) {
      console.warn("Could not delete old avatar (might not exist):", deleteError);
      // We ignore this error and continue with the upload
    }
  }


  // --- Handle Image Upload (Unchanged) ---
  const uploadAvatar = async (event) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      // Create a unique file path: userId/timestamp.ext (Supabase recommends this structure)
      const filePath = `${instructor.id}/${Date.now()}.${fileExt}`;

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true // Allow overwriting if the same path is somehow used
        });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      // 3. Delete Old Avatar (Crucial for cleanup)
      // We use the current avatarUrl state as the 'old URL'
      await deleteOldAvatar(avatarUrl);

      // 4. Update Instructor Table
      const { error: updateError } = await supabase
        .from('instructors')
        .update({ profile_image_url: publicUrl })
        .eq('id', instructor.id);

      if (updateError) throw updateError;

      // 5. Update Local State (with cache buster)
      const urlWithCacheBuster = `${publicUrl}?t=${Date.now()}`;
      setAvatarUrl(urlWithCacheBuster);
      toast.success('Profile picture updated successfully!');

    } catch (error) {
      console.error('Error uploading avatar:', error);
      const errorMessage = error.message || 'Error uploading image.';
      toast.error(errorMessage);
    } finally {
      setUploading(false);
      if (event.target) event.target.value = null;
    }
  };

  // ... (Other Core Functions unchanged)
  async function handleStatusChange(newStatus) {
    if (!instructor) return;
    setActiveStatus(newStatus);
    const { error } = await supabase
      .from("instructors")
      .update({ availability: newStatus })
      .eq("id", instructor.id);

    if (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status.");
      setActiveStatus(instructor.availability || "in_office");
    }
  }

  async function openAppointment(appointment) {
    setSelectedAppointment(appointment);
    setShowModal(true);
    if (appointment.status === "pending") {
      const { error } = await supabase.from("appointments").update({ status: "read" }).eq("id", appointment.id);
      if (error) {
        console.error("Error updating appointment status:", error);
      } else {
        setAppointments(prev => prev.map(a => a.id === appointment.id ? { ...a, status: 'read' } : a));
      }
    }
  }

  function closeModal() {
    setShowModal(false);
    setSelectedAppointment(null);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/instructor');
  };

  // 3. RENDER LOGIC
  if (!instructor) return <div className="dashboard-loading">Loading...</div>;

  if (!instructor.verified) {
    return (
      <div className="dashboard-loading">
        <p>Account awaiting admin approval.</p>
        <button onClick={handleLogout} className="logout-button" style={{ marginTop: '1rem' }}>Logout</button>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <Toaster />

      <nav className="dashboard-nav">
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </nav>

      <main className="dashboard-content">
        <img src={logo} className="dashboard-logo" alt="logo" />

        {/* --- Profile Picture Section (Unchanged) --- */}
        <div className="profile-section">
          <div className="avatar-wrapper">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="dashboard-avatar" />
            ) : (
              <div className="dashboard-avatar-placeholder">
                {uploading ? 'Uploading...' : 'Click 📷 to Upload'}
              </div>
            )}
            <label htmlFor="avatar-upload" className="upload-icon-btn" title="Change Profile Picture">
              {uploading ? '...' : '📷'}
            </label>
            <input
              type="file"
              id="avatar-upload"
              accept="image/*"
              onChange={uploadAvatar}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <h1>Hi, {instructor.name}!</h1>

        <div className="status-controls">
          <button className={`status-btn inside ${activeStatus === 'in_office' ? 'active' : ''}`} onClick={() => handleStatusChange('in_office')}>Inside Office</button>
          <button className={`status-btn in-class ${activeStatus === 'in_class' ? 'active' : ''}`} onClick={() => handleStatusChange('in_class')}>In Class</button>
          {/* UPDATED TEXT HERE */}
          <button className={`status-btn absent ${activeStatus === 'absent' ? 'active' : ''}`} onClick={() => handleStatusChange('absent')}>Not Available</button>
        </div>

        {/* UPDATED: Remarks Text Box with Edit/Save Logic */}
        <div className="remarks-section">
          <label htmlFor="instructor-remarks">Custom Status/Remarks:</label>
          <textarea
            id="instructor-remarks"
            className="remarks-textarea"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. 'Back in 10 mins', 'Meeting until 4 PM', or clear for no remark."
            maxLength={100}
            disabled={!isRemarksEditing || isRemarksSaving} // Disabled unless editing or saving
          />
          <div className="remarks-actions">
            {isRemarksEditing ? (
              <button
                className="remarks-save-btn"
                onClick={saveRemarksToDB}
                disabled={isRemarksSaving}
              >
                {isRemarksSaving ? 'Saving...' : 'Save Remarks'}
              </button>
            ) : (
              <button
                className="remarks-edit-btn"
                onClick={startEditRemarks}
              >
                Edit Remarks
              </button>
            )}
          </div>
        </div>

        <section className="appointments-section">
          <h2>Appointments</h2>
          <div className="appointments-list-box">
            {appointments.length === 0 ? (
              <p className="no-appointments">No appointments scheduled.</p>
            ) : (
              <div className="appointments-list">
                {appointments.map((a) => (
                  <div key={a.id} onClick={() => openAppointment(a)} className={`appointment-item ${a.status}`}>
                    <div className="appointment-info">{a.student_name} — {a.appointment_date} at {a.appointment_time}</div>
                    <div className="appointment-status-text">Status: {a.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* MODAL (Unchanged) */}
      {showModal && selectedAppointment && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Appointment Details</h3>
            <p><strong>Student Name:</strong> {selectedAppointment.student_name}</p>
            <p><strong>Student ID No.:</strong> {selectedAppointment.student_id || 'N/A'}</p>
            <p><strong>Mobile No.:</strong> {selectedAppointment.mobile_number || 'N/A'}</p>
            <p><strong>Email:</strong> {selectedAppointment.student_email}</p>
            <p><strong>Program:</strong> {selectedAppointment.student_program}</p>
            <p><strong>Year Level:</strong> {selectedAppointment.appointment_time}</p>
            <p><strong>Date:</strong> {selectedAppointment.appointment_date}</p>
            <p><strong>Time:</strong> {selectedAppointment.appointment_time}</p>
            <p><strong>Reason:</strong> {selectedAppointment.reason || "No reason provided"}</p>
            <p className="modal-status-text"><strong>Status:</strong> <span className={selectedAppointment.status}>{selectedAppointment.status}</span></p>
            <button onClick={closeModal} className="modal-close-btn-x">✕</button>
            <div className="modal-actions">
              <button onClick={closeModal} className="modal-close-btn">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;