import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../API/supabaseClient'; // Adjust path if necessary
import toast, { Toaster } from 'react-hot-toast';
import '../CSS/InstructorsProfile.css';
import profileImg from '../Images/profile.png'; // Adjust path if necessary

function InstructorsProfile() {
  const navigate = useNavigate();
  const location = useLocation();

  const { state } = location;
  const student = state?.student;
  const instructor = state?.instructor;

  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    reason: '',
    appointment_date: '',
    appointment_time: '',
  });

  const handleAppointmentChange = (e) => {
    const { name, value } = e.target;
    setAppointmentForm((prev) => ({ ...prev, [name]: value }));
  };

  // Utility Function to get Today's Date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Submission Handler with Time Validation
  const handleAppointmentSubmit = async (e) => {
    e.preventDefault();

    const { appointment_time } = appointmentForm;

    // --- TIME VALIDATION LOGIC ---
    const minTime = '07:00'; // 7:00 AM (24-hour format)
    const maxTime = '18:00'; // 6:00 PM (24-hour format)

    // Check if time is outside the acceptable range
    if (appointment_time < minTime || appointment_time > maxTime) {
      toast.error('The appointment hours are only 7 am to 6 pm.');
      return; // Stop the submission
    }
    // -----------------------------

    // FIX: Updated payload to use correct Supabase column names
    const payload = {
      instructor_id: instructor.id,
      student_name: student.name,
      student_year_level: student.yearLevel,
      student_program: student.program,
      student_email: student.email,
      reason: appointmentForm.reason,
      appointment_date: appointmentForm.appointment_date,
      appointment_time: appointmentForm.appointment_time,
      student_id: student.student_id,
      mobile_number: student.mobile_number,
    };

    console.log('📦 Sending this data to Supabase:', payload);
    const { error } = await supabase.from('appointments').insert([payload]);

    if (error) {
      console.error('❌ Supabase insert error:', error);
      toast.error('Failed to create appointment. Please try again.');
      return;
    }

    // Success Actions:
    toast.success('🎉 Appointment created successfully! Redirecting...');

    // Navigate to the main page (root route)
    setTimeout(() => {
      navigate('/');
    }, 500);

    setIsAppointmentModalOpen(false);
  };

  // Guard clause if data is missing
  if (!instructor || !student) {
    return (
      <div className="instructors-profile-page" style={{ textAlign: 'center' }}>
        <h2>Oops!</h2>
        <p>Student or instructor information is missing.</p>
        <button onClick={() => navigate('/student')} className="profile-button">
          Back to Student Form
        </button>
      </div>
    );
  }

  // Helper to process remarks into bullet points based on newlines
  const renderRemarksList = (remarksText) => {
    if (!remarksText) return null;
    return remarksText.split('\n')
      .filter(line => line.trim() !== '')
      .map((line, index) => <li key={index}>{line}</li>);
  };

  return (
    <div className="instructors-profile-page">
      <Toaster />

      {/* Main Centered Content */}
      <div className="profile-main-content">
        <div className="profile-image-container">
          <img
            src={instructor.profile_image_url || profileImg}
            alt={instructor.name}
            className="instructors-profile-image"
          />
          <span
            className={`indicator1 ${instructor.availability === 'in_office'
              ? 'inside'
              : instructor.availability === 'in_class'
                ? 'in-class'
                : 'outside'
              }`}
            title={
              instructor.availability === 'in_office'
                ? 'Inside Office'
                : instructor.availability === 'in_class'
                  ? 'In Class'
                  : 'Not Available' // UPDATED TEXT HERE (Indicator Dot Title)
            }
          ></span>
        </div>

        <h2>{instructor.name}</h2>

        <div
          className={`status ${instructor.availability === 'in_office'
            ? 'status-inside'
            : instructor.availability === 'in_class'
              ? 'status-in-class'
              : 'status-outside'
            }`}
        >
          Status:{' '}
          {instructor.availability === 'in_office'
            ? 'Inside Office'
            : instructor.availability === 'in_class'
              ? 'In Class'
              : 'Not Available'} {/* UPDATED TEXT HERE (Status Badge) */}
        </div>

        <div className="instructors-profile-buttons">
          <button
            onClick={() => setIsAppointmentModalOpen(true)}
            className="profile-button"
          >
            Set an Appointment
          </button>
          <button onClick={() => navigate(-1)} className="profile-button">
            Back to List
          </button>
        </div>
      </div>

      {/* Remarks Section (Absolutely Positioned to the Upper Right) */}
      {instructor.remarks && instructor.remarks.trim() !== '' && (
        <div className="remarks-container">
          <div className="remarks-header">Remarks:</div>
          <ul className="remarks-list">
            {renderRemarksList(instructor.remarks)}
          </ul>
        </div>
      )}

      {/* --- Appointment Modal (Unchanged) --- */}
      {isAppointmentModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Set an Appointment with {instructor.name}</h3>
            <form onSubmit={handleAppointmentSubmit}>
              <div className="form-group">
                <label htmlFor="reason">Concerns</label>
                <textarea
                  id="reason"
                  name="reason"
                  value={appointmentForm.reason}
                  onChange={handleAppointmentChange}
                  required
                  rows="3"
                  className="appointment-input"
                  placeholder="Reason for appointment"
                />
              </div>
              <div className="form-group">
                <label htmlFor="appointment_date">Date</label>
                <input
                  type="date"
                  id="appointment_date"
                  name="appointment_date"
                  value={appointmentForm.appointment_date}
                  onChange={handleAppointmentChange}
                  required
                  className="appointment-input custom-date-picker"
                  min={getTodayDate()}
                />
              </div>
              <div className="form-group">
                <label htmlFor="appointment_time">Time</label>
                <input
                  type="time"
                  id="appointment_time"
                  name="appointment_time"
                  value={appointmentForm.appointment_time}
                  onChange={handleAppointmentChange}
                  required
                  className="appointment-input custom-date-picker"
                />
              </div>
              <div className="modal-buttons">
                <button type="submit" className="profile-button">
                  Submit
                </button>
                <button
                  type="button"
                  onClick={() => setIsAppointmentModalOpen(false)}
                  className="profile-button"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default InstructorsProfile;