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

// ⭐ NEW HELPER FUNCTION TO FORMAT STATUS DISPLAY
const formatStatus = (status) => {
  if (!status) return 'N/A';
  // Replace underscores with space and capitalize the first letter of each word
  return status.replace(/_/g, ' ').split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
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

  // REMARKS STATES
  const [remarks, setRemarks] = useState('');
  const [isRemarksSaving, setIsRemarksSaving] = useState(false);
  const [isRemarksEditing, setIsRemarksEditing] = useState(false);

  // EMAIL REPLY STATES (NEW/UPDATED)
  const [replySubject, setReplySubject] = useState("Instructor Reply");
  const [replyMessage, setReplyMessage] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

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
    setRemarks(instrData.remarks || "");

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

  // --- CORE UTILITIES ---

  const saveRemarksToDB = async () => {
    if (!instructor) return;
    if (isRemarksSaving) return;

    setIsRemarksEditing(false);
    setIsRemarksSaving(true);

    const { error } = await supabase
      .from("instructors")
      .update({ remarks: remarks.trim() })
      .eq("id", instructor.id);

    setIsRemarksSaving(false);

    if (error) {
      console.error("Error updating remarks:", error);
      toast.error("Failed to save remarks.");
    } else {
      toast.success("Remarks saved!");
    }
  }

  const startEditRemarks = () => {
    setIsRemarksEditing(true);
  };

  async function deleteOldAvatar(oldUrl) {
    if (!oldUrl) return;

    const oldFilePath = getFilePathFromUrl(oldUrl);
    if (!oldFilePath) return;

    const pathToDelete = oldFilePath.replace('avatars/', '');

    const { error: deleteError } = await supabase.storage
      .from('avatars')
      .remove([pathToDelete]);

    if (deleteError) {
      console.warn("Could not delete old avatar (might not exist):", deleteError);
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
      const filePath = `${instructor.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      await deleteOldAvatar(avatarUrl);

      const { error: updateError } = await supabase
        .from('instructors')
        .update({ profile_image_url: publicUrl })
        .eq('id', instructor.id);

      if (updateError) throw updateError;

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

  // --- EMAIL FUNCTION (UPDATED) ---
  async function sendEmail(toEmail, subject, message) {
    if (isSendingEmail) return false;
    setIsSendingEmail(true);

    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        toast.error("Authentication required to send email.");
        setIsSendingEmail(false);
        return false;
      }

      const response = await fetch(
        "https://kbbgzxtravhgnysgeaiz.supabase.co/functions/v1/swift-responder",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ to: toEmail, subject, message }),
        }
      );

      const data = await response.json().catch(() => null);
      setIsSendingEmail(false);

      if (!response.ok) {
        console.error("❌ Email Error:", data?.error || response.statusText);
        toast.error("Failed to send email. Check console logs.");
        return false;
      }

      toast.success("Email sent successfully!");
      return true;

    } catch (err) {
      console.error("❌ Network Error:", err);
      toast.error("Network error. Check console.");
      setIsSendingEmail(false);
      return false;
    }
  }


  // --- Handle Appointment Action (Approve/Reject) ---
  async function handleAppointmentAction(newStatus) {
    if (!selectedAppointment || !replyMessage.trim()) {
      toast.error("Reply message is required to confirm action.");
      return;
    }

    if (selectedAppointment.status === newStatus) {
      toast.error(`Appointment is already marked as ${newStatus}.`);
      return;
    }

    // 1. Send Email Notification
    const actionText = newStatus === 'approved' ? 'Approved' : 'Not Approved';
    const emailSubject = `${actionText}: Your Appointment with ${instructor.name}`;

    const emailSuccess = await sendEmail(selectedAppointment.student_email, emailSubject, replyMessage);

    if (!emailSuccess) {
      // If email fails, stop the process and let the instructor retry
      toast.error(`Email failed. Please try sending the email again.`);
      return;
    }

    // 2. Update Database Status
    const { error } = await supabase
      .from("appointments")
      .update({ status: newStatus })
      .eq("id", selectedAppointment.id);

    if (error) {
      console.error(`Error updating status to ${newStatus}:`, error);
      toast.error(`Failed to update status to ${actionText}.`);
      // Since the database update failed but the email succeeded, we keep the old status locally.
      return;
    }

    // 3. Update Local State & UI
    toast.success(`Appointment successfully ${actionText.toLowerCase()}!`);

    setAppointments(prev => prev.map(a =>
      a.id === selectedAppointment.id ? { ...a, status: newStatus } : a
    ));

    // Update the selected appointment object immediately for modal consistency
    setSelectedAppointment(prev => ({ ...prev, status: newStatus }));

    // Optional: Close modal after successful action, but keeping it open allows
    // the user to see the updated status. Let's keep it open for status visibility.
    // closeModal(); 
  }


  async function openAppointment(appointment) {
    setSelectedAppointment(appointment);
    setShowModal(true);

    // Set default reply subject and message
    const actionStatus = appointment.status === 'pending' || appointment.status === 'read' ? 'Pending Action' : formatStatus(appointment.status);
    setReplySubject(`Reply to ${appointment.student_name} (Status: ${actionStatus})`);

    // Check if the appointment has already been acted upon and set a generic message
    const formattedStatus = formatStatus(appointment.status); // Use formatted status here
    const defaultMessage = (appointment.status === 'approved' || appointment.status === 'not_approved')
      ? `This appointment was already marked as ${formattedStatus}. You can send a follow-up email here.`
      : `Hi ${appointment.student_name},

Regarding your appointment request on ${appointment.appointment_date} at ${appointment.appointment_time}:

[Type your personalized response here. State clearly if you are approving or rejecting the request.]

Regards,
${instructor.name}`;

    setReplyMessage(defaultMessage);


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
    setReplySubject("Instructor Reply");
    setReplyMessage("");
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

  // Determine if the action buttons should be shown
  const isTransactionComplete = selectedAppointment &&
    (selectedAppointment.status === 'approved' || selectedAppointment.status === 'not_approved');


  return (
    <div className="dashboard-container">
      <Toaster />

      <nav className="dashboard-nav">
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </nav>

      <main className="dashboard-content">
        <img src={logo} className="dashboard-logo" alt="logo" />

        {/* --- Profile Picture Section --- */}
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
          <button className={`status-btn absent ${activeStatus === 'absent' ? 'active' : ''}`} onClick={() => handleStatusChange('absent')}>Not Available</button>
        </div>

        {/* --- Remarks Text Box --- */}
        <div className="remarks-section">
          <label htmlFor="instructor-remarks">Custom Status/Remarks:</label>
          <textarea
            id="instructor-remarks"
            className="remarks-textarea"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. 'Back in 10 mins', 'Meeting until 4 PM', or clear for no remark."
            maxLength={100}
            disabled={!isRemarksEditing || isRemarksSaving}
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
                    {/* ⭐ FORMATTED STATUS HERE */}
                    <div className="appointment-status-text">Status: {formatStatus(a.status)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* MODAL */}
      {showModal && selectedAppointment && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Appointment Details</h3>
            <p><strong>Student Name:</strong> {selectedAppointment.student_name}</p>
            <p><strong>Student ID No.:</strong> {selectedAppointment.student_id || 'N/A'}</p>
            <p><strong>Mobile No.:</strong> {selectedAppointment.mobile_number || 'N/A'}</p>
            <p><strong>Email:</strong> {selectedAppointment.student_email}</p>
            <p><strong>Program:</strong> {selectedAppointment.student_program}</p>
            <p><strong>Year Level:</strong> {selectedAppointment.student_year_level || 'N/A'}</p>
            <p><strong>Date:</strong> {selectedAppointment.appointment_date}</p>
            <p><strong>Time:</strong> {selectedAppointment.appointment_time}</p>
            <p><strong>Reason:</strong> {selectedAppointment.reason || "No reason provided"}</p>
            {/* ⭐ FORMATTED STATUS HERE */}
            <p className="modal-status-text"><strong>Status:</strong> <span className={selectedAppointment.status}>{formatStatus(selectedAppointment.status)}</span></p>
            <button onClick={closeModal} className="modal-close-btn-x">✕</button>

            {/* --- MODAL ACTIONS SECTION (UPDATED) --- */}
            <div className="modal-actions">
              <h4>Reply to Student and Take Action</h4>

              {/* Subject Input */}
              <input
                type="text"
                placeholder="Email subject"
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                className="reply-subject-input"
                disabled={isSendingEmail || isTransactionComplete}
              />

              {/* Reply Textbox (Email Body) */}
              <textarea
                placeholder="Type your reply to the student..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                className="reply-textbox"
                disabled={isSendingEmail || isTransactionComplete}
              />

              <div className="modal-actions-group">
                {/* Conditionally render Approve/Reject buttons */}
                {!isTransactionComplete ? (
                  <>
                    {/* Approve Button */}
                    <button
                      className="modal-action-btn modal-approve-btn"
                      onClick={() => handleAppointmentAction('approved')}
                      disabled={isSendingEmail || !selectedAppointment.student_email}
                    >
                      {isSendingEmail ? 'Sending...' : '✅ Approve'}
                    </button>

                    {/* Reject Button */}
                    <button
                      className="modal-action-btn modal-reject-btn"
                      onClick={() => handleAppointmentAction('not_approved')}
                      disabled={isSendingEmail || !selectedAppointment.student_email}
                    >
                      {isSendingEmail ? 'Sending...' : '❌ Not Approve'}
                    </button>
                  </>
                ) : (
                  // ⭐ FORMATTED STATUS HERE
                  <p className={`transaction-completed-message ${selectedAppointment.status}`}>
                    Action Completed: <span className="action-status-text">{formatStatus(selectedAppointment.status)}</span>
                  </p>
                )}

                <button onClick={closeModal} className="modal-close-btn">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;