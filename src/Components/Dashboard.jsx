import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Dashboard.css'; 
import DescriptionIcon from '@mui/icons-material/Description';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'font-awesome/css/font-awesome.min.css';


const Dashboard = ({ email, onLogout }) => {
    const [profile, setProfile] = useState({});
    const [loginTimestamps, setLoginTimestamps] = useState([]);
    const [files, setFiles] = useState([]); 
    const [currentPage, setCurrentPage] = useState(1);
    const logsPerPage = 15; 

    
    useEffect(() => {
        const meta = document.querySelector('meta[name=viewport]');
        const originalContent = meta?.getAttribute('content');
        if (meta) meta.setAttribute('content', 'width=520');

        return () => {
            if (meta) meta.setAttribute('content', originalContent || 'width=device-width, initial-scale=1.0');
        };
    }, []);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await axios.get('http://localhost:5000/profile', {
                   // params: { email },
                    withCredentials: true
                });
                setProfile(response.data);
                setLoginTimestamps(response.data.loginTimestamps || []);
                setFiles(response.data.files || []); 
            } catch (error) {
                if (error.response && error.response.status === 401) { // Token expired or invalid
                    localStorage.removeItem('userEmail');
                    window.location.reload();
                } else {
                    console.error('Error fetching profile:', error);
                }
            }
        };

        fetchProfile();
    }, [email]);

    // Decrypt file function
    const handleDecrypt = async (file) => {
        try {
            const response = await axios.post('http://localhost:5000/decrypt', {
                email,
                fileId: file._id, 
            },
        {
            withCredentials: true
        });
            const decryptedData = response.data;
            console.log('Decrypted file:', decryptedData);
            alert('File decrypted successfully!');
        } catch (error) {
            console.error('Error decrypting file:', error);
            alert('File decryption failed.');
        }
    };

    // Share file function
    const handleShare = async (file) => {
        const recipientEmail = prompt('Enter the recipient\'s email:');
        if (!recipientEmail) return;

        try {
            const response = await axios.post('http://localhost:5000/share', {
                email,
                recipientEmail,
                fileId: file._id, 
            },
            {
                withCredentials: true
            });
            alert('File shared successfully!');
        } catch (error) {
            console.error('Error sharing file:', error);
            alert('File sharing failed.');
        }
    };

    //Delete file function
    const [deletingFileId, setDeletingFileId] = useState(null);
    const handleDelete = async (file) => {
        const confirmed = window.confirm(`Are you sure you want to delete '${file.filename}'?`);
        if(!confirmed) return;

        toast.info('File deletion 🗑️ initiated', {
            position: 'top-right',
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            theme: 'light',
            style: { fontFamily: ' "Exo 2", sans-serif', fontSize: '16px' },
        });

        setDeletingFileId(file._id);
        setFiles(prevFiles => prevFiles.filter(f => f._id !== file._id));

        try {
            await axios.post('http://localhost:5000/delete', {
                email,
                pinataId: file.pinataId,
                }, {
                withCredentials: true
            });

            setTimeout(() => {
                toast.success(`'${file.filename}' deleted successfully`, {
                    position: 'top-right',
                    autoClose: 5000,
                    hideProgressBar: false,
                    closeOnClick: true,
                    pauseOnHover: true,
                    draggable: true,
                    style: { fontFamily: ' "Exo 2", sans-serif', fontSize: '16px' },
                });
            }, 100);


        } catch (error) {
            console.error('Error deleting file:', error);

            toast.error(`❌ Failed to delete '${file.filename}'`, {
            position: 'bottom-right',
            autoClose: 3000,
            });

            setFiles(prevFiles => [...prevFiles, file]); 
        } finally {
            setDeletingFileId(null); 
        }
    };

    
    // File Upload function
    const FileUpload = ({ email }) => {
        const [file, setFile] = useState(null);

        const handleFileChange = (e) => {
            setFile(e.target.files[0]);
        };

        const handleUpload = async () => {
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);
            formData.append('email', email);

            try {
                const response = await axios.post('http://localhost:5000/upload', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                    withCredentials: true
                });
                console.log('Pinata upload result:', response.data);
                alert('File encrypted and uploaded successfully!');
                setFiles([...files, response.data.file]); 
            } catch (error) {
                console.error('Error uploading file:', error);
                alert('File upload failed.');
            }
        };

        return (
            <div className='File_Upload text-center border border-gray-300 rounded-xl shadow-xl shadow-gray-300 pb-4 mt-10'>
                <p className='text-3xl mt-5 py-5 font-semibold'>UPLOAD NEW FILE </p>
                <input type="file" onChange={handleFileChange} />
                <button onClick={handleUpload} className='bg-green-500 rounded-md ml-[-50px] text-white px-5 py-2 hover:bg-green-600'>Upload</button>
            </div>
        );
    };
    
    const reversedLogs = [...loginTimestamps].reverse();
    const indexOfLastLog = currentPage * logsPerPage;
    const indexOfFirstLog = indexOfLastLog - logsPerPage;
    const currentLogs = reversedLogs.slice(indexOfFirstLog, indexOfLastLog);

    return (
        <div className="dashboard">
            <h1 className='text-4xl mb-2'>DASHBOARD</h1>
            <button onClick={onLogout} className="logout-btn">Logout</button>

            <div className='text-center border border-gray-300 rounded-xl shadow-xl shadow-gray-300 pb-4 '>
                <p className='text-3xl mb-2 mt-5 py-5 font-semibold'>PROFILE</p>
                <p className='text-xl'><strong>Email:</strong>  {profile.email}</p>
                <p className='text-xl'><strong>Registered At:</strong> {profile.registeredAt}</p>
            </div>

            <FileUpload email={email} />

            <div className='files border border-gray-300 rounded-xl shadow-xl shadow-gray-300 pb-4 mt-10'>
                <p className='mt-5 py-5 text-3xl text-center font-semibold'>MY FILES</p>
                <table className="files-table mx-auto w-[60%]">
                    <thead>
                        <tr>
                            <th className="text-center">Filename</th>
                            <th className="text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {files.length > 0 ? (
                                files.map((file, index) => (
                                <tr key={index} className={index % 2 === 0 ? 'even-row' : 'odd-row'}>
                                    <td>
                                    <DescriptionIcon style={{ marginRight: '8px' }} />
                                    {file.filename}
                                    </td>
                                    <td>
                                    <div className='flex justify-center space-x-2'>
                                        <button onClick={() => handleDecrypt(file)} className='bg-blue-500 rounded-md text-white px-3 py-2 hover:bg-blue-600'>
                                            <i className="fa fa-unlock" aria-hidden="true"></i> Decrypt
                                        </button>

                                        <button onClick={() => handleShare(file)} className='bg-purple-500 rounded-md text-white px-5 py-2 hover:bg-purple-600'>
                                            <i className="fa fa-share-square-o" aria-hidden="true"></i> Share
                                        </button>

                                        {deletingFileId === file._id ? (                  
                                          <div className="animate-spin text-yellow-500 text-2xl">🔄</div>
                                        ) : (
                                        <button onClick={() => handleDelete(file)}>
                                            <i className="fa fa-trash text-rose-500 text-6xl cursor-pointer hover:text-rose-700" style = {{fontSize:"30px"}} title="Delete file"></i>
                                        </button>
                                        )}
                                    </div>
                                    </td>
                                </tr>
                                ))
                        ) : (
                            <tr>
                                <td colSpan="2" className="no-files">
                                    No files available
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className='logs text-center border border-gray-300 rounded-xl shadow-xl shadow-gray-300 pb-4 mt-10 py-5'>
                <p className='my-5 text-3xl font-semibold'>LOGIN LOGS</p>
                <table className="logs-table mx-auto w-[70%]">
                    <thead>
                        <tr>
                            <th>Date, Time (UTC+00:00)</th>                            
                        </tr>
                    </thead>
                    <tbody>
                        {currentLogs.length > 0 ? (
                            currentLogs.map((log, index) => (
                            <tr key={index} className={index % 2 === 0 ? 'even-row' : 'odd-row'}>
                                <td>{log}</td>
                            </tr>
                            ))
                        ) : (
                            <tr>
                            <td colSpan="1" className="no-logs">No login logs available</td>
                            </tr>
                        )}
                    </tbody>

                </table>
                <div className="pagination mt-4">
                    {Array.from({ length: Math.ceil(reversedLogs.length / logsPerPage) }, (_, i) => (
                        <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`py-1 mx-1 my-1 w-10 rounded ${
                            currentPage === i + 1 ? 'bg-blue-500 text-white' : 'bg-gray-200'
                        }`}
                        >
                        {i + 1}
                        </button>
                 ))}
                </div>

            </div>

            <ToastContainer />
        </div>
    );
};

export default Dashboard;

