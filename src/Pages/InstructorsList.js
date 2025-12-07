import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../API/supabaseClient';
import '../CSS/InstructorsList.css';
// REMOVE THIS LINE: import profileImg from '../Images/profile.png';
import logo from '../Images/logo.png';

// Import a local placeholder or define a default image URL if needed
// For simplicity, we'll use a local image (if you keep it) OR a generic placeholder URL
const DEFAULT_PROFILE_IMG = '/path/to/default/placeholder.png'; // Adjust this path if you want a local default

function InstructorsList() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get the full student object from location.state
  const { state } = location;
  const student = state?.student;

  // Use state to hold the instructors list from Supabase
  const [instructors, setInstructors] = useState([]);

  // --- Fetch data from Supabase on component mount ---
  useEffect(() => {
    // Fetch initial data
    fetchInstructors();

    // Set up real-time listener for changes
    const channel = supabase
      .channel('instructors-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'instructors' },
        (payload) => {
          console.log('Change received:', payload);
          // Re-fetch data when a change occurs
          fetchInstructors();
        }
      )
      .subscribe();

    // Clean up the channel when the component unmounts
    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array means this runs once on mount

  // --- Function to fetch instructors ---
  async function fetchInstructors() {
    const { data, error } = await supabase
      .from('instructors')
      .select('*')
      .eq('verified', true); // Show only approved instructors

    if (error) {
      console.error('Error fetching instructors:', error);
    } else if (data) {
      setInstructors(data);
    }
  }

  // --- Handle navigation ---
  const handleProfileClick = (instructor) => {
    // Pass *full* student and instructor objects forward
    navigate(`/instructor/${instructor.id}`, {
      state: { student: student, instructor: instructor },
    });
  };

  // --- Guard clause if student info is missing (unchanged) ---
  if (!student) {
    return (
      <div className="instructors-list" style={{ textAlign: 'center', padding: '2rem' }}>
        <header className="App-header2">
          <img src={logo} className="App-logo2" alt="logo" />
        </header>
        <h2>Oops!</h2>
        <p>Student information is missing.</p>
        <button onClick={() => navigate('/student')} className="back-button">
          Back to Form
        </button>
      </div>
    );
  }

  // --- Main render ---
  return (
    <div className="instructors-list">
      <header className="App-header2">
        <img src={logo} className="App-logo2" alt="logo" />
      </header>

      <h2>Hi, {student?.name || 'Student'}!</h2>
      <p>Available Instructors</p>

      {/* --- NEW LEGEND COMPONENT (unchanged) --- */}
      <div className="availability-legend">
        <div className="legend-item">
          <span className="legend-dot inside"></span>
          <span>Inside Office (Present)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot in-class"></span>
          <span>In Class</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot outside"></span>
          <span>Outside Office (Not Available)</span>
        </div>
      </div>
      {/* --- END NEW LEGEND COMPONENT --- */}

      <ul>
        {/* Map over the 'instructors' state from Supabase */}
        {instructors.map((instructor) => (
          <li key={instructor.id} className="instructor-item">
            <button
              onClick={() => handleProfileClick(instructor)}
              className="instructor-box-button"
            >
              <div className="profile-image-container">
                {/* START: The critical change is here */}
                <img
                  // Use the profile_image_url from the instructor object,
                  // falling back to a default if it's null or undefined.
                  src={instructor.profile_image_url || DEFAULT_PROFILE_IMG}
                  alt={`Profile of ${instructor.name}`}
                  className="instructor-profile"
                />
                {/* END: The critical change is here */}
                <span
                  className={`indicator ${instructor.availability === 'in_office'
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
                        : 'Absent'
                  }
                ></span>
              </div>
              <div className="instructor-info">
                <strong>{instructor.name}</strong>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => navigate('/student')} className="back-button">
        Back to Form
      </button>
    </div>
  );
}

export default InstructorsList;