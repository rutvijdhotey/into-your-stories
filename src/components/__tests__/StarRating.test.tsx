import { render, fireEvent } from '@testing-library/react-native';
import StarRating from '../StarRating';

describe('StarRating', () => {
  it('renders 5 star buttons', () => {
    const { getAllByRole } = render(<StarRating value={3} onChange={() => {}} />);
    expect(getAllByRole('button')).toHaveLength(5);
  });

  it('calls onChange with the tapped star value', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<StarRating value={null} onChange={onChange} />);
    fireEvent.press(getByLabelText('Rate 4 stars'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('clears to null when the current value is tapped again', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(<StarRating value={4} onChange={onChange} />);
    fireEvent.press(getByLabelText('Rate 4 stars'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not render buttons when readOnly', () => {
    const { queryAllByRole, getAllByText } = render(<StarRating value={3} readOnly />);
    expect(queryAllByRole('button')).toHaveLength(0);
    expect(getAllByText('★').length).toBe(5);
  });
});
